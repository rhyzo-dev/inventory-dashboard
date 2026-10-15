/**
 * Duplicate pre-check — GET /api/inventory/duplicates
 *
 * Lets the Add form (live, as the editor types) find items that already share
 * the same "lot identity" as the one being entered. The identity is:
 *   sku + name + bin_location + specification + production_date + expiry_date
 * (all six; empty/absent values are treated as "none", not a wildcard).
 * A match on all six = the editor is re-entering a lot that already exists —
 * the exact double-entry case this guard exists to catch.
 *
 * This is a read-only pre-check for early notice. The authoritative block
 * lives on POST /api/inventory (which 409s unless allow_duplicate is set),
 * so the guard can't be bypassed by going straight to the create call.
 */
import type { PagesFunction } from '@cloudflare/workers-types'

const H = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

async function getUser(context: any): Promise<any | null> {
  const cookieHeader = context.request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null
  const { verifyJwt } = await import('../../lib/auth')
  const payload = await verifyJwt(match[1], context.env.AUTH_SECRET || '')
  if (!payload) return null
  return context.env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.sub).first<any>()
}

export const onRequestGet: PagesFunction = async (context) => {
  const user = await getUser(context)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: H })
  }

  try {
    const { env, request } = context
    const url = new URL(request.url)

    const sku = (url.searchParams.get('sku') || '').trim()
    const name = (url.searchParams.get('name') || '').trim()
    const bin = (url.searchParams.get('bin_location') || '').trim()
    const spec = (url.searchParams.get('specification') || '').trim()
    const prod = (url.searchParams.get('production_date') || '').trim()
    const exp = (url.searchParams.get('expiry_date') || '').trim()
    // On edit, exclude the item being edited so it doesn't flag itself.
    const excludeId = (url.searchParams.get('exclude_id') || '').trim()

    // Not enough identity to compare on — nothing to return.
    if (!sku || !name) {
      return new Response(JSON.stringify({ matches: [] }), { status: 200, headers: H })
    }

    // COALESCE turns a NULL bin/date/spec into '' so "no bin" / "no spec" /
    // "no date" lines up with an empty input, instead of silently never
    // matching.
    const sql = `
      SELECT id, sku, name, quantity, unit, bin_location, specification,
             production_date, expiry_date, updated_at
      FROM consumable_item
      WHERE sku = ?
        AND name = ?
        AND COALESCE(bin_location, '') = ?
        AND COALESCE(specification, '') = ?
        AND COALESCE(production_date, '') = ?
        AND COALESCE(expiry_date, '') = ?
        ${excludeId ? 'AND id <> ?' : ''}
      ORDER BY updated_at DESC
      LIMIT 5
    `
    const params: unknown[] = [sku, name, bin, spec, prod, exp]
    if (excludeId) params.push(excludeId)

    const res = await env.DB.prepare(sql).bind(...params).all<any>()
    const matches = (res.results || []).map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      quantity: r.quantity,
      unit: r.unit || '',
      bin_location: r.bin_location || '',
      specification: r.specification || '',
      production_date: r.production_date || '',
      expiry_date: r.expiry_date || '',
      updated_at: r.updated_at,
    }))

    return new Response(JSON.stringify({ matches }), { status: 200, headers: H })
  } catch (error) {
    console.error('Duplicates GET error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: H })
  }
}
