/**
 * GET /api/debug/health — optional diagnostics endpoint.
 *
 * HIDDEN BY DEFAULT. It only responds when explicitly enabled via vars/secrets:
 *   - DEBUG_TOKEN  → the caller must send ?token=<same value>
 *   - DEBUG_PUBLIC = "true" → open (for trusted staging only, never production)
 *
 * If neither is set, the endpoint returns 404 so it is invisible to scanners.
 * This keeps the utility for ops without leaking internal state on a public app.
 */
import type { PagesFunction } from '@cloudflare/workers-types'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const debugToken = (context.env.DEBUG_TOKEN as string) || ''
  const debugPublic = (context.env.DEBUG_PUBLIC as string) === 'true'

  // Invisible unless explicitly enabled
  if (!debugToken && !debugPublic) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: SECURITY_HEADERS })
  }

  // Token-gated access
  if (debugToken && !debugPublic) {
    if (url.searchParams.get('token') !== debugToken) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: SECURITY_HEADERS })
    }
  }

  try {
    // Minimal, non-sensitive liveness signal only — no env values, no secret
    // metadata, no user enumeration, no tips.
    let dbOk = false
    try {
      await context.env.DB.prepare('SELECT 1').first()
      dbOk = true
    } catch {}

    return new Response(JSON.stringify({
      ok: dbOk,
      database: { ok: dbOk },
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: SECURITY_HEADERS })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}
