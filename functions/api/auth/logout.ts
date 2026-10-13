/**
 * POST /api/auth/logout
 *
 * Revokes the refresh token from D1 and clears both cookies.
 * No state is kept server-side beyond token revocation.
 */

import type { PagesFunction } from '@cloudflare/workers-types'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const cookieHeader = request.headers.get('cookie') || ''

    // Extract refresh token
    const refreshMatch = cookieHeader.match(/(?:^|;\s*)refresh_token=([^;]*)/)
    if (refreshMatch) {
      // Revoke the refresh token in D1
      await env.DB.prepare(
        'DELETE FROM refresh_tokens WHERE token = ?'
      ).bind(refreshMatch[1]).run()
    }

    // Clear both cookies
    const clearCookie = (name: string) =>
      `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`

    return new Response(JSON.stringify({ message: 'Logged out successfully' }), {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        'Set-Cookie': [
          clearCookie('auth_token'),
          clearCookie('refresh_token'),
        ].join(', '),
      }
    })
  } catch (error) {
    console.error('Logout error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: SECURITY_HEADERS,
    })
  }
}
