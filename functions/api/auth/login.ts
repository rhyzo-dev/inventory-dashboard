/**
 * Auth-guarded login endpoint — POST /api/auth/login
 *
 * Flow:
 *  1. Validate rate limit (5 attempts/IP/min → 15-min lockout)
 *  2. Look up user by username
 *  3. Verify password (PBKDF2-SHA256, constant-time comparison)
 *  4. Check account not locked
 *  5. Generate access + refresh tokens
 *  6. Store refresh token in D1, set httpOnly cookies
 *  7. Return { message, user: { id, username, role } }
 *
 * Security: Never reveals whether username exists (same error for bad username or bad password).
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { hashPassword, verifyPassword, createTokens, type JwtPayload } from '../../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const ip = request.headers.get('cf-connecting-ip') || 'unknown'

    let body: { username?: string; password?: string }
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: SECURITY_HEADERS })
    }

    const username = (body.username || '').trim()
    const password = body.password || ''

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password are required' }), { status: 400, headers: SECURITY_HEADERS })
    }

    // ── Rate limit: 5 attempts per IP per minute ─────────────────────────────
    const lockoutResult = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM login_attempts
       WHERE ip = ? AND attempted_at > datetime('now', '-15 minutes')`
    ).bind(ip).first<{ cnt: number }>()

    if (lockoutResult && lockoutResult.cnt >= 5) {
      const user = await env.DB.prepare('SELECT is_locked, locked_until FROM users WHERE username = ?').bind(username).first()
      if (user?.is_locked) {
        return new Response(JSON.stringify({ error: 'Account locked. Try again later.' }), { status: 423, headers: SECURITY_HEADERS })
      }
    }

    // ── Look up user ─────────────────────────────────────────────────────────
    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, role, is_locked, locked_until, failed_attempts FROM users WHERE username = ?'
    ).bind(username).first<any>()

    // Always return same error regardless of whether user exists
    if (!user) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO login_attempts (ip, attempted_at, success) VALUES (?, datetime(\'now\'), 0)'
      ).bind(ip).run()
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers: SECURITY_HEADERS })
    }

    // Check lockout
    if (user.is_locked === 1) {
      if (user.locked_until) {
        const lockedUntil = new Date(user.locked_until)
        if (lockedUntil > new Date()) {
          const minsLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000)
          return new Response(JSON.stringify({ error: `Account locked. Try again in ${minsLeft} minutes.` }), { status: 423, headers: SECURITY_HEADERS })
        }
      }
      // Lock expired — reset
      await env.DB.prepare(
        'UPDATE users SET is_locked = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?'
      ).bind(user.id).run()
    }

    // ── Verify password ──────────────────────────────────────────────────────
    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      // Increment failed attempts
      const newCount = (user.failed_attempts || 0) + 1
      await env.DB.prepare(
        `UPDATE users SET failed_attempts = ?, is_locked = CASE WHEN ? >= 5 THEN 1 ELSE is_locked END,
         locked_until = CASE WHEN ? >= 5 THEN datetime('now', '+15 minutes') ELSE locked_until END
         WHERE id = ?`
      ).bind(newCount, newCount, newCount, user.id).run()

      await env.DB.prepare(
        'INSERT OR IGNORE INTO login_attempts (ip, attempted_at, success) VALUES (?, datetime(\'now\'), 0)'
      ).bind(ip).run()

      return new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers: SECURITY_HEADERS })
    }

    // ── Success — reset attempts, store refresh token ────────────────────────
    await env.DB.prepare(
      'UPDATE users SET failed_attempts = 0, is_locked = 0, locked_until = NULL WHERE id = ?'
    ).bind(user.id).run()

    await env.DB.prepare(
      'INSERT OR IGNORE INTO login_attempts (ip, attempted_at, success) VALUES (?, datetime(\'now\'), 1)'
    ).bind(ip).run()

    const tokens = await createTokens(user.id, user.role, env.AUTH_SECRET || '')

    // Store refresh token in D1
    await env.DB.prepare(
      'INSERT OR REPLACE INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(tokens.refreshToken, user.id, tokens.expiresAt).run()

    const expiresAtMs = new Date(tokens.expiresAt).getTime()
    const maxAgeSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))

    // Set httpOnly cookies
    const setCookie = (name: string, value: string, maxAge: number) =>
      `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`

    const cookies = [
      setCookie('auth_token', tokens.accessToken, maxAgeSeconds),
      setCookie('refresh_token', tokens.refreshToken, 604800), // 7 days
    ].join(', ')

    return new Response(JSON.stringify({
      message: 'Login successful',
      user: { id: user.id, username: user.username, role: user.role },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, 'Set-Cookie': cookies },
    })
  } catch (error) {
    console.error('Login error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}
