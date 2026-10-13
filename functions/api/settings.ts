/**
 * GET /api/settings — Get app-wide settings (any authenticated user)
 * PUT  /api/settings — Update settings (admin only)
 */
import type { PagesFunction } from '@cloudflare/workers-types'
import { hasRole } from '../lib/auth'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

async function getUser(context: any): Promise<any | null> {
  const cookieHeader = context.request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null
  const { verifyJwt } = await import('../lib/auth')
  const payload = await verifyJwt(match[1], context.env.AUTH_SECRET || '')
  if (!payload) return null
  return context.env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.sub).first<any>()
}

export const onRequestGet: PagesFunction = async (context) => {
  const user = await getUser(context)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: SECURITY_HEADERS })
  }
  try {
    const rows = await context.env.DB.prepare(
      'SELECT key, value FROM app_settings'
    ).all<{ key: string; value: string }>()
    const settings: Record<string, string> = {}
    for (const row of rows.results || []) {
      settings[row.key] = row.value
    }
    return new Response(JSON.stringify(settings), { status: 200, headers: SECURITY_HEADERS })
  } catch (e) {
    console.error('[settings] GET error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}

export const onRequestPut: PagesFunction = async (context) => {
  const user = await getUser(context)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: SECURITY_HEADERS })
  }
  if (!hasRole(user.role as any, 'admin')) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: SECURITY_HEADERS })
  }
  try {
    const body = await context.request.json() as Record<string, unknown>
    const allowedKeys = new Set(['company_name'])
    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.has(key)) continue
      if (typeof value !== 'string' || value.length > 100) continue
      await context.env.DB.prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).bind(key, String(value)).run()
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: SECURITY_HEADERS })
  } catch (e) {
    console.error('[settings] PUT error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}
