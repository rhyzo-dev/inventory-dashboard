/**
 * User management API — admin only.
 *
 * GET    /api/users           — list all users (admin)
 * POST   /api/users           — create user (admin)
 * PUT    /api/users/[id]      — update user role/status (admin)
 * DELETE /api/users/[id]      — delete user (admin, cannot delete self)
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { hashPassword, verifyPassword, validatePassword, isBreachedPassword, hasRole } from '../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

function json(data: any, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...extra } })
}

// Helper: check auth and return user or error response
async function requireAuth(context: any): Promise<{ user: any; env: any } | Response> {
  const { env, request } = context
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return json({ error: 'Authentication required' }, 401)

  const payload = await (await import('../lib/auth')).verifyJwt(match[1], env.AUTH_SECRET || '')
  if (!payload) return json({ error: 'Invalid session' }, 401)

  const user = await env.DB.prepare('SELECT id, username, role, is_locked FROM users WHERE id = ?').bind(payload.sub).first<any>()
  if (!user || user.is_locked) return json({ error: 'Session invalid or account locked' }, 401)

  return { user, env }
}

// ── GET: List all users ──────────────────────────────────────────────────────

export const onRequestGet: PagesFunction = async (context) => {
  const auth = await requireAuth(context)
  if (auth instanceof Response) return auth

  const { user, env } = auth
  if (!hasRole(user.role as any, 'admin')) return json({ error: 'Admin access required' }, 403)

  const result = await env.DB.prepare(
    'SELECT id, username, role, is_locked, failed_attempts, locked_until, created_at, updated_at FROM users ORDER BY created_at ASC'
  ).all()

  return json({ users: result.results })
}

// ── POST: Create user ────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction = async (context) => {
  const auth = await requireAuth(context)
  if (auth instanceof Response) return auth

  const { user, env } = auth
  if (!hasRole(user.role as any, 'admin')) return json({ error: 'Admin access required' }, 403)

  let body
  try { body = await context.request.json() } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { username, password, role } = body as { username?: string; password?: string; role?: string }
  if (!username || !password) return json({ error: 'Username and password are required' }, 400)
  if (!['admin', 'editor', 'viewer'].includes(role || '')) return json({ error: 'Invalid role. Must be admin, editor, or viewer' }, 400)
  if (username.length < 3 || username.length > 50) return json({ error: 'Username must be 3-50 characters' }, 400)

  // Validate password strength
  const pwValidation = validatePassword(password)
  if (!pwValidation.valid) return json({ error: `Weak password: ${pwValidation.errors.join(', ')}` }, 400)

  // Check if password is in a known breach
  const isBreached = await isBreachedPassword(password)
  if (isBreached) return json({ error: 'This password has appeared in a known data breach. Please choose a different one.' }, 400)

  // Check username uniqueness
  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username.trim()).first()
  if (existing) return json({ error: 'Username already taken' }, 400)

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()

  await env.DB.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, username.trim(), passwordHash, role, now, now).run()

  return json({
    id: userId,
    username: username.trim(),
    role,
    message: 'User created successfully',
  }, 201)
}

// ── PUT: Update user ─────────────────────────────────────────────────────────

export const onRequestPut: PagesFunction = async (context) => {
  const auth = await requireAuth(context)
  if (auth instanceof Response) return auth

  const { user, env } = auth
  if (!hasRole(user.role as any, 'admin')) return json({ error: 'Admin access required' }, 403)

  const url = new URL(context.request.url)
  const id = url.pathname.split('/').pop()
  if (!id || id.length < 5) return json({ error: 'Invalid user ID' }, 400)

  let body
  try { body = await context.request.json() } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  // Admin cannot modify themselves
  if (id === user.id) return json({ error: 'Cannot modify your own account' }, 400)

  const updates: string[] = []
  const params: any[] = []

  if (body.role && ['admin', 'editor', 'viewer'].includes(body.role)) {
    updates.push('role = ?')
    params.push(body.role)
  }
  if (body.is_locked !== undefined) {
    updates.push('is_locked = ?', 'locked_until = ?')
    params.push(body.is_locked ? 1 : 0, body.is_locked ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null)
  }
  if (body.password) {
    const pwValidation = validatePassword(body.password)
    if (!pwValidation.valid) return json({ error: `Weak password: ${pwValidation.errors.join(', ')}` }, 400)
    const isBreached = await isBreachedPassword(body.password)
    if (isBreached) return json({ error: 'This password has appeared in a known data breach.' }, 400)
    updates.push('password_hash = ?')
    params.push(await hashPassword(body.password))
  }

  if (updates.length === 0) return json({ error: 'No valid fields to update' }, 400)

  updates.push("updated_at = datetime('now')")
  params.push(id)

  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()

  return json({ message: 'User updated successfully' })
}

// ── DELETE: Remove user ──────────────────────────────────────────────────────

export const onRequestDelete: PagesFunction = async (context) => {
  const auth = await requireAuth(context)
  if (auth instanceof Response) return auth

  const { user, env } = auth
  if (!hasRole(user.role as any, 'admin')) return json({ error: 'Admin access required' }, 403)

  const url = new URL(context.request.url)
  const id = url.pathname.split('/').pop()
  if (!id || id.length < 5) return json({ error: 'Invalid user ID' }, 400)

  // Cannot delete yourself
  if (id === user.id) return json({ error: 'Cannot delete your own account' }, 400)

  // Check user exists
  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()
  if (!target) return json({ error: 'User not found' }, 404)

  // Delete refresh tokens first (foreign key would cascade, but be explicit)
  await env.DB.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()

  return json({ message: 'User deleted successfully' })
}
