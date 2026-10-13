/**
 * POST /api/auth/refresh — Rotate the session using the refresh_token cookie.
 *
 * Reads the refresh_token cookie, validates it against D1, and issues a fresh
 * access token + rotated refresh token as httpOnly cookies. No access token
 * is required, so this is the one endpoint the frontend can call silently
 * (with credentials) to renew an expired access token without re-login.
 */
import type { PagesFunction } from '@cloudflare/workers-types'
import { createTokens } from '../../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { env, request } = context

    // ── Read refresh token from cookie ─────────────────────────────────────
    const cookieHeader = request.headers.get('cookie') || ''
    const match = cookieHeader.match(/(?:^|;\s*)refresh_token=([^;]*)/)
    if (!match) {
      return new Response(JSON.stringify({ error: 'No refresh token' }), { status: 401, headers: SECURITY_HEADERS })
    }
    const refreshToken = decodeURIComponent(match[1])

    // ── Look up the refresh token in D1 ────────────────────────────────────
    const row = await env.DB.prepare(
      'SELECT token, user_id, expires_at FROM refresh_tokens WHERE token = ?'
    ).bind(refreshToken).first<{ token: string; user_id: string; expires_at: string }>()

    if (!row) {
      return new Response(JSON.stringify({ error: 'Invalid refresh token' }), { status: 401, headers: SECURITY_HEADERS })
    }

    // ── Check expiry ───────────────────────────────────────────────────────
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await env.DB.prepare('DELETE FROM refresh_tokens WHERE token = ?').bind(refreshToken).run()
      return new Response(JSON.stringify({ error: 'Session expired — please log in again' }), { status: 401, headers: SECURITY_HEADERS })
    }

    // ── Verify the user still exists and is not locked out ─────────────────
    const user = await env.DB.prepare(
      'SELECT id, username, role, is_locked, locked_until FROM users WHERE id = ?'
    ).bind(row.user_id).first<{ id: string; username: string; role: string; is_locked: number; locked_until: string | null }>()

    if (!user) {
      await env.DB.prepare('DELETE FROM refresh_tokens WHERE token = ?').bind(refreshToken).run()
      return new Response(JSON.stringify({ error: 'User no longer exists' }), { status: 401, headers: SECURITY_HEADERS })
    }

    if (user.is_locked === 1 && user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return new Response(JSON.stringify({ error: 'Account is locked' }), { status: 423, headers: SECURITY_HEADERS })
    }

    // ── Issue fresh token pair and rotate the refresh token ───────────────
    const tokens = await createTokens(user.id, user.role, env.AUTH_SECRET || '')

    // Delete the used refresh token, store the new one (rotation)
    await env.DB.prepare('DELETE FROM refresh_tokens WHERE token = ?').bind(refreshToken).run()
    await env.DB.prepare(
      'INSERT OR REPLACE INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(tokens.refreshToken, user.id, tokens.expiresAt).run()

    const expiresAtMs = new Date(tokens.expiresAt).getTime()
    const maxAgeSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))

    const setCookie = (name: string, value: string, maxAge: number) =>
      `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`

    const cookies = [
      setCookie('auth_token', tokens.accessToken, maxAgeSeconds),
      setCookie('refresh_token', tokens.refreshToken, 604800), // 7 days
    ].join(', ')

    return new Response(
      JSON.stringify({ message: 'Session refreshed', user: { id: user.id, username: user.username, role: user.role } }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, 'Set-Cookie': cookies } }
    )
  } catch (error) {
    console.error('Refresh error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}
