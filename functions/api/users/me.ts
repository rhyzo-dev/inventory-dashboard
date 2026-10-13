/**
 * GET /api/users/me — returns the currently authenticated user's info.
 * Used by the frontend to check if the user is logged in.
 */

import type { PagesFunction } from '@cloudflare/workers-types'

const SECURITY_HEADERS = {
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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: SECURITY_HEADERS })
  }
  return new Response(JSON.stringify(user), { status: 200, headers: SECURITY_HEADERS })
}
