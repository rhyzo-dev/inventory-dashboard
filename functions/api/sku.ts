/**
 * Per-SKU inventory summary + optional thresholds.
 *
 * The team thinks in SKUs (an item can exist in several bins/lots with different
 * manufacture/expiry dates), and cares about the TOTAL on hand per SKU plus an
 * optional min/max threshold set per SKU (only fast-moving production items use
 * these). Lots within a SKU are listed FEFO (First-Expiry-First-Out): soonest
 * expiry is issued first; lots with no expiry date are issued last.
 *
 * Routes:
 *   GET  /api/sku — aggregated per-SKU summary (any authenticated user)
 *     ?category=<name>&search=<text> narrow the SKUs, mirroring /api/inventory
 *   PUT  /api/sku — upsert a SKU's optional min/max thresholds (editor/admin)
 *     body: { sku: string, min_threshold?: number|null, max_threshold?: number|null }
 *
 * Backed by the thin `sku` table (migration 0006) for the optional thresholds,
 * and a live GROUP BY over consumable_item for the totals. Nothing here writes
 * to or migrates consumable_item, so existing items are unaffected.
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { hasRole } from '../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: SECURITY_HEADERS })
}

/** Sanitize string input: trim whitespace, escape HTML to prevent XSS */
function sanitize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Extract user from auth cookie, return null if not authenticated */
async function getUser(context: any): Promise<any | null> {
  const cookieHeader = context.request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null
  const { verifyJwt } = await import('../lib/auth')
  const payload = await verifyJwt(match[1], context.env.AUTH_SECRET || '')
  if (!payload) return null
  return context.env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.sub).first<any>()
}

/** Require any authenticated user. Returns user or a 401 Response. */
async function requireAuth(context: any): Promise<any | Response> {
  const user = await getUser(context)
  if (!user) return json({ error: 'Authentication required' }, 401)
  return user
}

/** Require admin or editor. Returns user or a 403 Response. */
async function requireWriteAccess(context: any): Promise<any | Response> {
  const user = await requireAuth(context)
  if (user instanceof Response) return user
  if (!hasRole(user.role as any, 'editor')) {
    return json({ error: 'Permission denied — editors and admins only' }, 403)
  }
  return user
}

/** Parse JSON body, returning { body } or a ready-made 400 Response. */
async function parseBody(request: Request): Promise<{ body: unknown; error?: Response }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { error: json({ error: 'Invalid JSON' }, 400) }
  }
  return { body }
}

// ─── GET: Per-SKU summary ─────────────────────────────────────────────────────

export const onRequestGet: PagesFunction = async (context) => {
  const user = await requireAuth(context)
  if (user instanceof Response) return user

  try {
    const { env, request } = context
    const url = new URL(request.url)
    const category = url.searchParams.get('category')
    const search = url.searchParams.get('search')
    const sort = url.searchParams.get('sort') || 'sku'

    // Shared WHERE clause for the item-driven queries (same filters as /api/inventory)
    const where: string[] = ['1=1']
    const whereParams: unknown[] = []
    if (category) {
      where.push('ci.category = ?')
      whereParams.push(sanitize(category))
    }
    if (search) {
      where.push('(ci.name LIKE ? OR ci.sku LIKE ? OR ci.description LIKE ?)')
      const like = `%${sanitize(search)}%`
      whereParams.push(like, like, like)
    }
    const whereClause = where.join(' AND ')

    // Optional reordering of the SKU rows themselves. The per-SKU lots below stay
    // FEFO-ordered and grouped by SKU regardless — only the summary-row order moves.
    const skuOrder: Record<string, string> = {
      'name': 'name ASC',
      'qty-asc': 'total_quantity ASC',
      'qty-desc': 'total_quantity DESC',
      'expiry': "(soonest_expiry IS NULL OR soonest_expiry = '') ASC, soonest_expiry ASC",
    }
    const skuOrderBy = skuOrder[sort] || 'sku ASC'

    // 1) Per-SKU aggregate totals (grouped; FEFO-safe stats: soonest expiry, undated lots)
    const aggResult = await env.DB.prepare(`
      SELECT
        ci.sku                                            AS sku,
        MAX(ci.name)                                      AS name,
        MAX(ci.category)                                  AS category,
        MAX(ci.unit)                                      AS unit,
        SUM(ci.quantity)                                  AS total_quantity,
        COUNT(*)                                          AS lot_count,
        COUNT(DISTINCT NULLIF(ci.bin_location, ''))       AS bin_count,
        MIN(CASE WHEN ci.expiry_date IS NOT NULL AND ci.expiry_date != ''
                 THEN ci.expiry_date END)                 AS soonest_expiry,
        COUNT(CASE WHEN ci.expiry_date IS NULL OR ci.expiry_date = '' THEN 1 END) AS undated_count,
        MAX(CASE WHEN ci.expiry_date IS NOT NULL AND ci.expiry_date != ''
                  AND ci.expiry_date >= date('now') AND ci.expiry_date <= date('now', '+30 days') THEN 1 ELSE 0 END) AS expiring_soon,
        MAX(CASE WHEN ci.expiry_date IS NOT NULL AND ci.expiry_date != ''
                  AND ci.expiry_date < date('now') THEN 1 ELSE 0 END) AS expired
      FROM consumable_item ci
      WHERE ${whereClause}
      GROUP BY ci.sku
      ORDER BY ${skuOrderBy}
    `).bind(...whereParams).all()
    const rows = aggResult.results as unknown as Array<Record<string, unknown>>

    // 2) Optional per-SKU thresholds (the sku table is small — only fast movers set these)
    const threshResult = await env.DB.prepare(
      'SELECT sku, min_threshold, max_threshold FROM sku'
    ).all()
    const threshMap = new Map<string, { min: number | null; max: number | null }>()
    for (const t of (threshResult.results as unknown as Array<{ sku: string; min_threshold: number | null; max_threshold: number | null }>)) {
      threshMap.set(t.sku, { min: t.min_threshold, max: t.max_threshold })
    }

    // 3) Every lot, ordered FEFO within each SKU so the frontend can show issue order
    const lotsResult = await env.DB.prepare(`
      SELECT ci.id, ci.sku, ci.quantity, ci.unit, ci.bin_location, ci.production_date, ci.expiry_date
      FROM consumable_item ci
      WHERE ${whereClause}
      ORDER BY ci.sku ASC,
               (ci.expiry_date IS NULL OR ci.expiry_date = '') DESC,
               ci.expiry_date ASC,
               ci.production_date ASC,
               ci.bin_location ASC
    `).bind(...whereParams).all()
    const lotsBySku = new Map<string, Array<Record<string, unknown>>>()
    for (const lot of (lotsResult.results as unknown as Array<Record<string, unknown>>)) {
      const list = lotsBySku.get(lot.sku as string) || []
      list.push(lot)
      lotsBySku.set(lot.sku as string, list)
    }

    // Merge into the response shape
    const skus = rows.map((r) => {
      const total = Number(r.total_quantity) || 0
      const th = threshMap.get(String(r.sku))
      const minThreshold = th ? th.min : null
      const maxThreshold = th ? th.max : null
      return {
        sku: String(r.sku),
        name: (r.name as string) || '',
        category: (r.category as string) || '',
        unit: (r.unit as string) || '',
        total_quantity: total,
        min_threshold: minThreshold,
        max_threshold: maxThreshold,
        lot_count: Number(r.lot_count) || 0,
        bin_count: Number(r.bin_count) || 0,
        soonest_expiry: (r.soonest_expiry as string | null) || null,
        undated_count: Number(r.undated_count) || 0,
        expiring_soon: Number(r.expiring_soon) > 0,
        expired: Number(r.expired) > 0,
        // Threshold-driven flags only make sense when a minimum is actually set
        is_out: total <= 0,
        is_low: minThreshold != null && total > 0 && total < minThreshold,
        // FEFO lots: index 0 is the lot to issue first
        lots: (lotsBySku.get(String(r.sku)) || []).map((l) => ({
          id: String(l.id),
          quantity: Number(l.quantity) || 0,
          unit: (l.unit as string | null) || null,
          bin_location: (l.bin_location as string | null) || null,
          production_date: (l.production_date as string | null) || null,
          expiry_date: (l.expiry_date as string | null) || null,
        })),
      }
    })

    return json({ skus })
  } catch (error) {
    console.error('SKU GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

// ─── PUT: Upsert optional per-SKU thresholds ─────────────────────────────────

export const onRequestPut: PagesFunction = async (context) => {
  const user = await requireWriteAccess(context)
  if (user instanceof Response) return user

  try {
    const { env, request } = context
    const { body, error } = await parseBody(request)
    if (error) return error

    const b = body as Record<string, unknown>
    const skuCode = sanitize(String(b.sku || '')).trim()
    if (!skuCode) return json({ error: 'sku is required' }, 400)

    // Coerce to non-negative integer or null (null = "no threshold")
    const toInt = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
    }

    // Omitting a field preserves the existing value; passing null clears it
    const existing = await env.DB.prepare(
      'SELECT min_threshold, max_threshold FROM sku WHERE sku = ?'
    ).bind(skuCode).first<{ min_threshold: number | null; max_threshold: number | null }>()
    const curMin = existing ? existing.min_threshold : null
    const curMax = existing ? existing.max_threshold : null
    const minThreshold = b.min_threshold !== undefined ? toInt(b.min_threshold) : curMin
    const maxThreshold = b.max_threshold !== undefined ? toInt(b.max_threshold) : curMax

    if (minThreshold != null && maxThreshold != null && maxThreshold < minThreshold) {
      return json({ error: 'max_threshold must be greater than or equal to min_threshold' }, 400)
    }

    await env.DB.prepare(`
      INSERT INTO sku (sku, min_threshold, max_threshold, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(sku) DO UPDATE SET
        min_threshold = excluded.min_threshold,
        max_threshold = excluded.max_threshold,
        updated_at = datetime('now')
    `).bind(skuCode, minThreshold, maxThreshold).run()

    return json({
      sku: skuCode,
      min_threshold: minThreshold,
      max_threshold: maxThreshold,
      message: 'Thresholds saved',
    })
  } catch (error) {
    console.error('SKU PUT error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
