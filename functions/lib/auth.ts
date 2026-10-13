/**
 * Shared authentication utilities for Pages Functions.
 *
 * Uses Web Crypto API (built into Cloudflare Workers) — no external dependencies.
 *
 * Password hashing: PBKDF2-SHA256, 100k iterations, 16-byte salt
 *   Format: base64(salt):base64(hash)
 *
 * JWT: HS256, 15-minute access tokens, payload { sub, role, jti, iat, exp }
 *
 * Rate limiting: D1 counter table (login_attempts)
 *   5 attempts per IP per minute → temporary lockout
 */

// ── Constants ────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BYTES = 32       // 256-bit
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000   // 15 minutes
const REFRESH_TOKEN_TTL_MS  = 7 * 24 * 60 * 60 * 1000  // 7 days
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000    // 15 minutes

// ── Helpers ──────────────────────────────────────────────────────────────────

/** URL-safe base64 encode (no padding) */
function b64urlEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Standard base64 decode (handles +/ and padding) */
function b64Decode(str: string): Uint8Array {
  return new Uint8Array(Array.from(atob(str), c => c.charCodeAt(0)))
}

/** URL-safe base64 decode (handles -_ and optional padding) */
function b64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  return b64Decode(base64)
}

/** Decode a hash string — auto-detects standard vs URL-safe base64 */
function decodeHashPart(str: string): Uint8Array {
  // If it contains + or / it's standard base64; otherwise URL-safe
  if (/[+/]/.test(str)) return b64Decode(str)
  return b64urlDecode(str)
}

/** Get current ISO timestamp */
function nowISO(): string {
  return new Date().toISOString()
}

/** Generate a UUID v4 string */
function uuid(): string {
  return crypto.randomUUID()
}

// ── Password Hashing (PBKDF2 via Web Crypto API) ─────────────────────────────

/**
 * Hash a password. Returns "base64(salt):base64(key)" format.
 * Uses 100k PBKDF2-SHA256 iterations — fast to verify in Workers, expensive to brute-force.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))

  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, KEY_BYTES * 8
  )

  const hash = b64urlEncode(new Uint8Array(derivedBits))
  const saltStr = b64urlEncode(salt)
  return `${saltStr}:${hash}`
}

/**
 * Verify a password against a stored hash.
 * Returns true if the password matches.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltStr, expectedHash] = stored.split(':')
  if (!saltStr || !expectedHash) return false

  const salt = decodeHashPart(saltStr)
  const encoder = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, KEY_BYTES * 8
  )

  // Decode both to raw bytes and compare — ignores encoding format differences
  const computedBytes = new Uint8Array(derivedBits)
  const expectedBytes = decodeHashPart(expectedHash)
  return constantTimeEqual(
    b64urlEncode(computedBytes),
    b64urlEncode(expectedBytes)
  )
}

/** Compare two strings in constant time to prevent timing attacks */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// ── JWT ──────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string     // user id
  role: string
  jti: string     // token ID (for refresh token linkage)
  iat: number
  exp: number
}

/** Sign a JWT with HMAC-SHA256 using the project secret */
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const header = b64urlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${header}.${body}`

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))
  const sig = b64urlEncode(new Uint8Array(signature))

  return `${signingInput}.${sig}`
}

/** Verify and decode a JWT. Returns null if invalid or expired. */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const [headerB64, _payloadB64, sigB64] = token.split('.')
    if (!headerB64 || !sigB64) return null

    // Verify signature
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const sigBytes = b64urlDecode(sigB64)
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(`${headerB64}.${_payloadB64}`))
    if (!valid) return null

    // Decode payload
    const payload = JSON.parse(atob(_payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as JwtPayload
    if (payload.exp && payload.exp * 1000 < Date.now()) return null

    return payload
  } catch {
    return null
  }
}

/** Create an access token (short-lived) and a refresh token (stored in D1) */
export async function createTokens(userId: string, role: string, secret: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: string
}> {
  const jti = uuid()
  const now = Date.now()

  const accessToken = await signJwt({
    sub: userId,
    role,
    jti,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ACCESS_TOKEN_TTL_MS) / 1000),
  }, secret)

  const refreshToken = uuid()
  const expiresAt = new Date(now + REFRESH_TOKEN_TTL_MS).toISOString()

  return { accessToken, refreshToken, expiresAt }
}

// ── Breached Password Check (HaveIBeenPwned k-anonymity) ─────────────────────

/**
 * Check if a password has appeared in a known breach.
 * Uses the k-anonymity API: send first 5 chars of SHA-1 hash,
 * receive matching suffixes, check locally.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(password))
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

    const prefix = hashHex.slice(0, 5)
    const suffix = hashHex.slice(5)

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`)
    if (!res.ok) return false  // Don't block login if HIBP is down

    const text = await res.text()
    for (const line of text.split('\n')) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix.trim().toUpperCase() === suffix && parseInt(count) >= 5) {
        return true  // Password found in breach with 5+ occurrences
      }
    }
    return false
  } catch {
    return false  // Don't block login if check fails
  }
}

// ── Password Validation ──────────────────────────────────────────────────────

export interface PasswordValidation {
  valid: boolean
  errors: string[]
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = []
  if (password.length < 8) errors.push('Minimum 8 characters')
  if (password.length > 128) errors.push('Maximum 128 characters')
  if (!/[a-zA-Z]/.test(password)) errors.push('Must contain a letter')
  if (!/\d/.test(password)) errors.push('Must contain a number')
  return { valid: errors.length === 0, errors }
}

// ── Role Check ───────────────────────────────────────────────────────────────

export type Role = 'admin' | 'editor' | 'viewer'
export const ROLE_ORDER: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 }

/** Check if user's role meets the minimum required role */
export function hasRole(userRole: Role, required: Role | Role[]): boolean {
  const requiredList = Array.isArray(required) ? required : [required]
  const userLevel = ROLE_ORDER[userRole] ?? -1
  return requiredList.some(r => ROLE_ORDER[r] <= userLevel)
}

/** Parse the auth cookie from a Request, returns decoded payload or null */
export function parseAuthCookie(request: Request): JwtPayload | null {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null

  const secret = (globalThis as any).__AUTH_SECRET  // Set by middleware
  if (!secret) return null

  return verifyJwt(match[1], secret)
}
