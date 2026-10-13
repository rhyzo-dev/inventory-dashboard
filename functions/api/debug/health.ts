/**
 * GET /api/debug/health — diagnostics endpoint
 *
 * Returns auth state, DB connectivity, env summary, and function status.
 *
 * Query params:
 *   ?token=<secret>  — required when DEBUG_TOKEN is set in env
 *   ?full            — include user details (requires auth)
 *
 * Set DEBUG_TOKEN in wrangler.toml [vars] to protect this endpoint on production.
 * Set DEBUG_PUBLIC=true to bypass the token check entirely (dev only).
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { verifyJwt } from '../../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const url = new URL(context.request.url)
    const debugToken = context.env.DEBUG_TOKEN as string | undefined
    const debugPublic = (context.env.DEBUG_PUBLIC as string) === 'true'
    const requestedToken = url.searchParams.get('token') || ''
    const includeFull = url.searchParams.get('full') === 'true'

    // Auth check for the debug endpoint itself
    if (debugToken && !debugPublic) {
      if (!requestedToken || requestedToken !== debugToken) {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid DEBUG_TOKEN', hint: 'Append ?token=<value> to the URL' }),
          { status: 401, headers: SECURITY_HEADERS }
        )
      }
    }

    const cookieHeader = context.request.headers.get('cookie') || ''
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)

    // Parse auth state
    let authState: Record<string, unknown> = { hasCookie: !!match, authenticated: false }
    if (match) {
      const payload = await verifyJwt(match[1], context.env.AUTH_SECRET || '')
      authState = {
        hasCookie: true,
        authenticated: !!payload,
        payload: payload ? { sub: payload.sub, role: payload.role } : null,
        cookiePresent: true,
      }
      if (includeFull && payload) {
        const user = await context.env.DB.prepare(
          'SELECT id, username, role, created_at FROM users WHERE id = ?'
        ).bind(payload.sub).first<any>()
        ;(authState as any).user = user
      }
    }

    // DB connectivity test
    let dbStatus: Record<string, unknown> = { ok: false, latencyMs: 0 }
    try {
      const t0 = Date.now()
      await context.env.DB.prepare('SELECT 1').first()
      dbStatus = { ok: true, latencyMs: Date.now() - t0 }
    } catch (e) {
      dbStatus = { ok: false, error: (e as Error).message }
    }

    // D1 user count
    let userCount = null
    try {
      userCount = await context.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>()
    } catch {}

    // Build response — never expose actual secret values
    const response = {
      ok: true,
      timestamp: new Date().toISOString(),
      auth: authState,
      database: dbStatus,
      users: { count: userCount?.cnt ?? null },
      env: {
        hasAuthSecret: !!(context.env.AUTH_SECRET as string),
        authSecretLength: (context.env.AUTH_SECRET as string)?.length ?? 0,
        hasTigris: !!(context.env.TIGRIS_BUCKET as string),
        tigrisBucket: context.env.TIGRIS_BUCKET || null,
        hasD1: dbStatus.ok,
        debugProtected: !!(debugToken && !debugPublic),
      },
      tips: [] as string[],
    }

    // Generate helpful tips
    if (!authState.authenticated) {
      response.tips.push('Not authenticated — try POST /api/auth/login first')
    }
    if (!dbStatus.ok) {
      response.tips.push('D1 database unreachable — check binding in wrangler.toml')
    }
    if (response.users.count === 0) {
      response.tips.push('No users in database — run migrations/0002_auth_tables.sql')
    }
    if (debugToken && !debugPublic) {
      response.tips.push(`Debug endpoint is protected. Use ?token=${debugToken.slice(0, 4)}... to access.`)
    }

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: SECURITY_HEADERS,
    })
  } catch (error) {
    console.error('Debug health error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: (error as Error).message }),
      { status: 500, headers: SECURITY_HEADERS }
    )
  }
}
