/**
 * Global middleware — runs before every request.
 *
 * Responsibilities:
 * 1. Parse auth cookie → attach decoded JWT payload to context.locals.user
 * 2. Make the JWT secret available to handlers via globalThis (Workers limitation)
 * 3. Add security headers (CSP, X-Frame-Options, etc.)
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { verifyJwt } from './lib/auth'

export const onRequest: PagesFunction = async (context) => {
  const request = context.request
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)

  // Decode JWT if present
  if (match) {
    const secret = context.env.AUTH_SECRET
    if (secret) {
      const payload = await verifyJwt(match[1], secret)
      if (payload) {
        // Attach user info to context for downstream handlers
        ;(context as any).locals = { user: payload }
      }
    }
  }

  // Expose secret to handlers that need it (Workers don't share env between modules well)
  ;(globalThis as any).__AUTH_SECRET = context.env.AUTH_SECRET

  const response = await context.next()

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // Content-Security-Policy: same-origin only. Allows the built CSS/JS, inline
  // style attributes used by React, and data:/blob: for client-side image
  // compression. This is defense-in-depth against XSS — a compromised script
  // can't exfiltrate to an external host or load remote code.
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '))

  // HSTS: force HTTPS for a year, including subdomains
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  return response
}
