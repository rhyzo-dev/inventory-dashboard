/**
 * Categories API — admin and editor access.
 *
 * GET    /api/categories          — list all (public for dropdown)
 * POST   /api/categories          — create (admin + editor)
 * PUT    /api/categories/[id]     — update (admin + editor)
 * DELETE /api/categories/[id]     — delete (admin only)
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

// ── GET: List categories (public — no auth required for dropdown) ────────────
export const onRequestGet: PagesFunction = async (context) => {
  try {
    const { env } = context
    const result = await env.DB.prepare(
      'SELECT id, name, color, description, created_at FROM categories ORDER BY name ASC'
    ).all()
    return json({ categories: result.results })
  } catch (error) {
    console.error('Categories GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

// ── POST: Create category (admin + editor) ───────────────────────────────────

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

    const { name, color, description } = body as { name?: string; color?: string; description?: string }
    if (!name || name.trim().length < 1) return json({ error: 'Category name is required' }, 400)
    if (name.trim().length > 50) return json({ error: 'Name must be 50 characters or fewer' }, 400)

    // Validate color (hex)
    const hexColor = (color || '#6b7280').trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(hexColor)) return json({ error: 'Color must be a hex value (e.g. #3b82f6)' }, 400)

    // Check uniqueness
    const existing = await env.DB.prepare('SELECT id FROM categories WHERE name = ?').bind(name.trim()).first()
    if (existing) return json({ error: 'Category name already exists' }, 400)

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await env.DB.prepare(`
      INSERT INTO categories (id, name, color, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, name.trim(), hexColor, description || null, now, now).run()

    return json({ id, name: name.trim(), color: hexColor, description: description || null, message: 'Category created' }, 201)
  } catch (error) {
    console.error('Categories POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

// ── PUT: Update category (admin + editor) ────────────────────────────────────

export const onRequestPut: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const user = await getUser(env, request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    if (!hasRole(user.role as any, 'editor')) return json({ error: 'Editor or admin access required' }, 403)

    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()
    if (!id || id.length < 5) return json({ error: 'Invalid category ID' }, 400)

    let body
    try { body = await request.json() } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const checks: string[] = []
    const params: any[] = []

    if (body.name !== undefined) {
      if (body.name.trim().length < 1 || body.name.trim().length > 50) {
        return json({ error: 'Name must be 1-50 characters' }, 400)
      }
      checks.push('name = ?')
      params.push(body.name.trim())
    }
    if (body.color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) {
        return json({ error: 'Color must be a hex value (e.g. #3b82f6)' }, 400)
      }
      checks.push('color = ?')
      params.push(body.color.trim())
    }
    if (body.description !== undefined) {
      checks.push('description = ?')
      params.push(body.description || null)
    }

    if (checks.length === 0) return json({ error: 'No fields to update' }, 400)

    // Check name uniqueness (excluding self)
    if (body.name !== undefined) {
      const duplicate = await env.DB.prepare(
        'SELECT id FROM categories WHERE name = ? AND id != ?'
      ).bind(body.name.trim(), id).first()
      if (duplicate) return json({ error: 'Category name already exists' }, 409)
    }

    checks.push("updated_at = datetime('now')")
    params.push(id)

    await env.DB.prepare(
      `UPDATE categories SET ${checks.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    return json({ message: 'Category updated' })
  } catch (error) {
    console.error('Categories PUT error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

// ── DELETE: Remove category (admin only) ─────────────────────────────────────

export const onRequestDelete: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const user = await getUser(env, request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    if (!hasRole(user.role as any, 'admin')) return json({ error: 'Admin access required' }, 403)

    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()
    if (!id || id.length < 5) return json({ error: 'Invalid category ID' }, 400)

    // Check if any items use this category
    const itemCount = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM consumable_item WHERE category = (SELECT name FROM categories WHERE id = ?)'
    ).bind(id).first<any>()

    if (itemCount && Number(itemCount.cnt) > 0) {
      return json({ error: `Cannot delete: ${itemCount.cnt} item(s) use this category. Reassign items first.` }, 409)
    }

    await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run()
    return json({ message: 'Category deleted' })
  } catch (error) {
    console.error('Categories DELETE error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
