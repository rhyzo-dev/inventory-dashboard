/**
 * Inventory Dashboard API — Cloudflare Pages Functions
 *
 * Architecture:
 *   - All data stored in Cloudflare D1 (SQLite). Table uses UUID primary keys.
 *   - Images stored in Tigris (S3-compatible object storage) via @aws-sdk/client-s3.
 *   - Rate limiting applied per-IP: 30 req/min for inventory, 10 req/min for uploads.
 *   - Security headers added by functions/_middleware.ts (CSP, X-Frame-Options, etc.).
 *
 * Route structure:
 *   GET     /api/inventory       — list items (requires any authenticated user)
 *   POST    /api/inventory       — create item (admin + editor only)
 *   PUT     /api/inventory/[id]  — update item (admin + editor only)
 *   DELETE  /api/inventory/[id]  — delete item (admin only)
 *   POST    /api/upload          — upload image (admin + editor only)
 *
 * IMPORTANT: D1 does NOT support auto-increment for integer PKs with UUID tables.
 *   We generate UUIDs client-side in the Worker using crypto.randomUUID() and
 *   include them directly in INSERT statements. RowID is not available for these tables.
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { hasRole } from '../lib/auth'

const CONTENT_TYPE_JSON = { 'Content-Type': 'application/json' }
const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
  if (!user) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: SECURITY_HEADERS })
  return user
}

/** Require admin or editor. Returns user or a 403 Response. */
async function requireWriteAccess(context: any): Promise<any | Response> {
  const user = await requireAuth(context)
  if (user instanceof Response) return user
  if (!hasRole(user.role as any, 'editor')) {
    return new Response(JSON.stringify({ error: 'Permission denied — editors and admins only' }), { status: 403, headers: SECURITY_HEADERS })
  }
  return user
}

/** Require admin. Returns user or a 403 Response. */
async function requireAdmin(context: any): Promise<any | Response> {
  const user = await requireAuth(context)
  if (user instanceof Response) return user
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: SECURITY_HEADERS })
  }
  return user
}

/** Sanitize string input: trim whitespace, escape HTML to prevent XSS */
function sanitize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Parse JSON body, return { body } or a 400 Response */
async function parseBody(request: Request): Promise<{ body: unknown; error?: Response }> {
  let body
  try {
    body = await request.json()
  } catch {
    return { error: new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: SECURITY_HEADERS }) }
  }
  return { body }
}

/** Check rate limit per IP. Returns true if within limit, false if exceeded. */
function checkRateLimit(env: any, ip: string, limit: number): boolean {
  const key = `rate:${ip}`
  const count = env.RATE_LIMIT ? parseInt(env.RATE_LIMIT.get(key) || '0') : 0
  if (count >= limit) return false
  if (env.RATE_LIMIT) env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 60 }).catch(() => {})
  return true
}

// ─── GET: List all items ───────────────────────────────────────────────────────

export const onRequestGet: PagesFunction = async (context) => {
  const user = await requireAuth(context)
  if (user instanceof Response) return user

  try {
    const { env, request } = context
    const url = new URL(request.url)
    const category = url.searchParams.get('category')
    const search = url.searchParams.get('search')
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')))

    let query = 'SELECT * FROM consumable_item WHERE 1=1'
    const params: unknown[] = []

    if (category) {
      query += ' AND category = ?'
      params.push(sanitize(category))
    }
    if (search) {
      query += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ?)'
      const like = `%${search}%`
      params.push(like, like, like)
    }

    // Count total matching rows for pagination
    let countSql = `SELECT COUNT(*) as cnt FROM consumable_item WHERE 1=1`
    const countParams: unknown[] = []
    if (category) { countSql += ' AND category = ?'; countParams.push(sanitize(category)) }
    if (search) {
      countSql += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ?)'
      const like = `%${search}%`
      countParams.push(like, like, like)
    }
    const countResult = await env.DB.prepare(countSql).bind(...countParams).first<{ cnt: number }>()
    const total = countResult?.cnt ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    const stmt = env.DB.prepare(query).bind(...params, limit, (page - 1) * limit)
    const result = await stmt.all()
    const items = result.results as Array<Record<string, unknown>>

    return new Response(JSON.stringify({
      items,
      pagination: { page, limit, total, pages: totalPages },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
    })
  } catch (error) {
    console.error('Inventory GET error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: SECURITY_HEADERS
    })
  }
}

// ─── POST: Create new item ─────────────────────────────────────────────────────

export const onRequestPost: PagesFunction = async (context) => {
  const user = await requireWriteAccess(context)
  if (user instanceof Response) return user

  try {
    const { env, request } = context
    const ip = request.headers.get('cf-connecting-ip') || 'unknown'

    if (!checkRateLimit(env, ip, 30)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: SECURITY_HEADERS })
    }

    const { body, error } = await parseBody(request)
    if (error) return error

    const b = body as Record<string, unknown>

    // Validate required fields
    if (!b.sku || !b.name) {
      return new Response(JSON.stringify({ error: 'SKU and name are required' }), { status: 400, headers: SECURITY_HEADERS })
    }

    // Generate UUID for this new item — D1 UUID tables have no auto-increment
    const newItemId = crypto.randomUUID()
    const now = new Date().toISOString()

    await env.DB.prepare(`
      INSERT INTO consumable_item
        (id, sku, name, description, category, unit, quantity, min_threshold, max_threshold,
         bin_location, production_date, expiry_date, image_url, creator_id, updater_id,
         created_at, updated_at, specification, facility_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newItemId,
      sanitize(String(b.sku)),
      sanitize(String(b.name)),
      sanitize(String(b.description || '')),
      sanitize(String(b.category || '')),
      sanitize(String(b.unit || '')),
      Number(b.quantity) || 0,
      Number(b.min_threshold) || 0,
      Number(b.max_threshold) || 0,
      sanitize(String(b.bin_location || '')),
      b.production_date ? String(b.production_date) : null,
      b.expiry_date ? String(b.expiry_date) : null,
      sanitize(String(b.image_url || '')),
      user.id,
      user.id,
      now,
      now,
      sanitize(String(b.specification || '')),
      env.FACILITY_ID || null
    ).run()

    return new Response(JSON.stringify({
      id: newItemId,
      sku: sanitize(String(b.sku)),
      name: sanitize(String(b.name)),
      message: 'Item created successfully'
    }), { status: 201, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS } })
  } catch (error) {
    console.error('Inventory POST error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}
