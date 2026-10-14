/**
 * Units API — admin and editor access.
 *
 * GET    /api/units          — list all (public for dropdown)
 * POST   /api/units          — create (admin + editor)
 * PUT    /api/units/[id]     — update (admin + editor)
 * DELETE /api/units/[id]     — delete (admin only; blocked while in use)
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { hasRole } from '../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

function json(data: any, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...extra } })
}

/** Get current user from cookie, or null if not authenticated */
async function getUser(env: any, request: Request): Promise<any | null> {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null
  const { verifyJwt } = await import('../lib/auth')
  const payload = await verifyJwt(match[1], env.AUTH_SECRET || '')
  if (!payload) return null
  return env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.sub).first<any>()
}

/** Sanitize a short label: trim + escape HTML entities */
function sanitize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── GET: List units (public — no auth required for dropdown) ─────────────────
export const onRequestGet: PagesFunction = async (context) => {
  try {
    const { env } = context
    const result = await env.DB.prepare(
      'SELECT id, name, created_at FROM units ORDER BY name ASC'
    ).all()
    return json({ units: result.results })
  } catch (error) {
    console.error('Units GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

// ── POST: Create unit (admin + editor) ───────────────────────────────────────

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const user = await getUser(env, request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    if (!hasRole(user.role as any, 'editor')) return json({ error: 'Editor or admin access required' }, 403)

    let body
    try { body = await request.json() } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const name = sanitize((body as { name?: string }).name)
    if (name.length < 1) return json({ error: 'Unit name is required' }, 400)
    if (name.length > 20) return json({ error: 'Name must be 20 characters or fewer' }, 400)

    // Case-insensitive uniqueness so "L" and "l" don't collide
    const existing = await env.DB.prepare('SELECT id FROM units WHERE name = ? COLLATE NOCASE').bind(name).first()
    if (existing) return json({ error: 'Unit already exists' }, 400)

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await env.DB.prepare(`
      INSERT INTO units (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, name, now, now).run()

    return json({ id, name, message: 'Unit created' }, 201)
  } catch (error) {
    console.error('Units POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

// ── PUT: Update unit (admin + editor) ────────────────────────────────────────

export const onRequestPut: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const user = await getUser(env, request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    if (!hasRole(user.role as any, 'editor')) return json({ error: 'Editor or admin access required' }, 403)

    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()
    if (!id || id.length < 5) return json({ error: 'Invalid unit ID' }, 400)

    let body
    try { body = await request.json() } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const name = sanitize((body as { name?: string }).name)
    if (name.length < 1 || name.length > 20) return json({ error: 'Name must be 1-20 characters' }, 400)

    // Check name uniqueness (excluding self), case-insensitive
    const duplicate = await env.DB.prepare(
      'SELECT id FROM units WHERE name = ? COLLATE NOCASE AND id != ?'
    ).bind(name, id).first()
    if (duplicate) return json({ error: 'Unit name already exists' }, 409)

    await env.DB.prepare(
      "UPDATE units SET name = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(name, id).run()

    return json({ message: 'Unit updated' })
  } catch (error) {
    console.error('Units PUT error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

// ── DELETE: Remove unit (admin only; blocked if any item uses it) ───────────

export const onRequestDelete: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const user = await getUser(env, request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    if (!hasRole(user.role as any, 'admin')) return json({ error: 'Admin access required' }, 403)

    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()
    if (!id || id.length < 5) return json({ error: 'Invalid unit ID' }, 400)

    // Refuse to delete a unit still in use — items keep their unit text
    const rowCount = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM consumable_item WHERE unit = (SELECT name FROM units WHERE id = ?)'
    ).bind(id).first<any>()

    if (rowCount && Number(rowCount.cnt) > 0) {
      return json({ error: `Cannot delete: ${rowCount.cnt} item(s) use this unit. Reassign items first.` }, 409)
    }

    await env.DB.prepare('DELETE FROM units WHERE id = ?').bind(id).run()
    return json({ message: 'Unit deleted' })
  } catch (error) {
    console.error('Units DELETE error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
