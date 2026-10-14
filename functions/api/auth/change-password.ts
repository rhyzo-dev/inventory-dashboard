/**
 * Self-service password change — POST /api/auth/change-password
 *
 * Any authenticated user (admin, editor, viewer) can change their OWN password.
 * This is the path for the bootstrap/default admin in a public repo: after first
 * login with the seeded credential, they change it here and lock out the old one.
 *
 * Body: { current_password: string, new_password: string }
 *
 * Behavior:
 *   - Verifies the current password (constant-time PBKDF2 compare).
 *   - Validates the new password's strength and checks it against known breaches (HIBP).
 *   - Rejects reusing the same password.
 *   - Rehashes and stores the new password, then revokes the user's refresh tokens so
 *     the old credential can't open a fresh session (the current access token stays
 *     valid for its remaining lifetime, so the user isn't kicked mid-page).
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { hashPassword, verifyPassword, validatePassword, isBreachedPassword } from '../../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: SECURITY_HEADERS })
}

/** Load the current authenticated user (incl. password_hash) or null. */
async function getCurrentUser(context: any): Promise<any | null> {
  const { env, request } = context
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null
  const { verifyJwt } = await import('../../lib/auth')
  const payload = await verifyJwt(match[1], env.AUTH_SECRET || '')
  if (!payload) return null
  return env.DB.prepare(
    'SELECT id, username, role, password_hash, is_locked FROM users WHERE id = ?'
  ).bind(payload.sub).first<any>()
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const user = await getCurrentUser(context)
    if (!user) return json({ error: 'Authentication required' }, 401)
    if (user.is_locked) return json({ error: 'Account is locked' }, 423)

    let body: { current_password?: string; new_password?: string }
    try {
      body = await context.request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const current = String(body.current_password || '')
    const next = String(body.new_password || '')
    if (!current || !next) return json({ error: 'current_password and new_password are required' }, 400)

    // 1) Verify the current password
    const currentOk = await verifyPassword(current, user.password_hash)
    if (!currentOk) return json({ error: 'Current password is incorrect' }, 400)

    // 2) Reject an unchanged password
    if (current === next) return json({ error: 'New password must be different from the current one' }, 400)

    // 3) Strength + breach policy (same rules as account creation)
    const v = validatePassword(next)
    if (!v.valid) return json({ error: `Weak password: ${v.errors.join(', ')}` }, 400)
    const breached = await isBreachedPassword(next)
    if (breached) return json({ error: 'This password has appeared in a known data breach. Choose a different one.' }, 400)

    // 4) Store the new hash
    const hash = await hashPassword(next)
    await context.env.DB.prepare(
      "UPDATE users SET password_hash = ?, failed_attempts = 0, is_locked = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?"
    ).bind(hash, user.id).run()

    // 5) Revoke existing refresh tokens so the old credential can't mint new sessions
    await context.env.DB.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(user.id).run()

    return json({ message: 'Password changed successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
