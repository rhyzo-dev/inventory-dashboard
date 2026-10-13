/**
 * End-to-end test suite for the Inventory Dashboard auth flow.
 *
 * Run: npm test
 * Or: npx tsx scripts/test.ts [--base-url <url>] [--token <debug-token>]
 *
 * Tests cover:
 *  1. Health / diagnostics endpoint
 *  2. Login — correct credentials
 *  3. Login — wrong password
 *  4. Login — nonexistent user
 *  5. Login — missing fields
 *  6. Protected endpoint without auth → 401
 *  7. Protected endpoint with cookie → 200 + correct user
 *  8. Cookie presence check after login
 *  9. Logout clears cookies
 * 10. Full round-trip: login → access data → logout
 */

;(async () => {

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://inventory-dashboard-7qh.pages.dev'
const ARGV = process.argv.slice(2)
const BASE_URL = (ARGV.find(a => a.startsWith('--base-url='))?.split('=')[1]) || DEFAULT_BASE_URL
const DEBUG_TOKEN = (ARGV.find(a => a.startsWith('--token='))?.split('=')[1]) || ''
const USERNAME = 'admin'
const PASSWORD = 'Admin@2024!'

// Strip leading slash for consistent joining
const base = BASE_URL.replace(/\/$/, '')

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let cookies = '' // session cookie jar

const ok = (name) => { passed++; console.log(`  ✅ ${name}`) }
const fail = (name, detail) => { failed++; console.log(`  ❌ ${name}: ${detail}`) }

const request = async (path, options = {}) => {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (cookies) headers['cookie'] = cookies
  const res = await fetch(url, { ...options, headers })
  // Capture Set-Cookie headers for jar management
  const setCookies = res.headers.get('set-cookie')?.split(', ') || []
  if (setCookies.length > 0) {
    const existing = new Map(cookies.split('; ').filter(Boolean).map(c => {
      const [name, ...rest] = c.split('=')
      return [name.trim(), rest.join('=')]
    }))
    for (const sc of setCookies) {
      // Each Set-Cookie header value has format: name=value; Path=...; HttpOnly; ...
      // Only split on first '=' to get name=value
      const eqIdx = sc.indexOf('=')
      if (eqIdx > 0) {
        const name = sc.slice(0, eqIdx).trim()
        const valueEnd = sc.indexOf(';')
        const value = valueEnd > eqIdx ? sc.slice(eqIdx + 1, valueEnd) : sc.slice(eqIdx + 1)
        // Max-Age=0 or empty value means delete the cookie
        if (/Max-Age=0/.test(sc) || value === '') {
          existing.delete(name)
        } else {
          existing.set(name, value)
        }
      }
    }
    cookies = [...existing.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  let body = null
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) body = await res.json()
  else if (ct.includes('text') || ct.includes('json')) body = await res.text()
  return { status: res.status, body, headers: res.headers }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log(`\n🧪 Inventory Dashboard Test Suite`)
console.log(`   Base URL: ${base}`)
console.log(`   Debug token: ${DEBUG_TOKEN ? '***' : '(none)'}\n`)

// 1. Health check
console.log('── Health / Diagnostics ──')
{
  const url = DEBUG_TOKEN
    ? `/api/debug/health?token=${DEBUG_TOKEN}`
    : '/api/debug/health'
  const r = await request(url)
  if (r.status === 200 && r.body?.ok) {
    ok('GET /api/debug/health returns ok')
    const { auth, database, env } = r.body
    if (database?.ok) ok('D1 database is reachable')
    else fail('D1 connectivity', String(database?.error ?? 'unknown'))
    if (env?.hasAuthSecret) ok('AUTH_SECRET is configured')
    else fail('AUTH_SECRET', 'not found in env')
    if (env?.authSecretLength >= 32) ok(`AUTH_SECRET length OK (${env.authSecretLength} chars)`)
    else fail('AUTH_SECRET length', `${env?.authSecretLength ?? 0} chars (need ≥32)`)
    console.log(`   Users in DB: ${r.body.users?.count ?? '?'}`)
    if ((r.body.tips || []).length > 0) {
      for (const tip of r.body.tips) console.log(`   ℹ️  ${tip}`)
    }
  } else {
    fail('Health check', `HTTP ${r.status}`)
  }
}

// 2. Login — correct credentials
console.log('\n── Login Flow ──')
{
  const r = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })
  if (r.status === 200 && r.body?.user?.username === USERNAME) {
    ok('Login with correct credentials → 200')
  } else {
    fail('Login correct creds', `HTTP ${r.status}: ${JSON.stringify(r.body)}`)
  }
}

// 3. Login — wrong password
{
  const r = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME, password: 'wrongpassword123' }),
  })
  if (r.status === 401 && r.body?.error) {
    ok('Login with wrong password → 401')
  } else {
    fail('Login wrong password', `HTTP ${r.status}: ${JSON.stringify(r.body)}`)
  }
}

// 4. Login — nonexistent user
{
  const r = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'nonexistent_user_xyz', password: 'anything' }),
  })
  if (r.status === 401) {
    ok('Login nonexistent user → 401 (same error as wrong password)')
  } else {
    fail('Login nonexistent user', `HTTP ${r.status}`)
  }
}

// 5. Login — missing fields
{
  const r = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME }),
  })
  if (r.status === 400) {
    ok('Login missing password → 400')
  } else {
    fail('Login missing password', `HTTP ${r.status}`)
  }
}

// 6. Cookie presence check after login
{
  if (cookies.includes('auth_token=') && cookies.includes('refresh_token=')) {
    ok('Cookies set after login (auth_token + refresh_token present)')
  } else {
    fail('Cookie format', `Cookies: ${cookies || '(empty)'}`)
  }
}

// 7. Protected endpoint with cookie
{
  const r = await request('/api/users/me')
  if (r.status === 200 && r.body?.username === USERNAME) {
    ok('GET /api/users/me with cookie → 200')
  } else {
    fail('Users/me with cookie', `HTTP ${r.status}: ${JSON.stringify(r.body)}`)
  }
}

// 8. Protected endpoint with no cookie → 401
{
  const staleCookies = cookies
  cookies = ''
  const r = await request('/api/users/me')
  cookies = staleCookies // restore
  if (r.status === 401) {
    ok('GET /api/users/me without cookie → 401')
  } else {
    fail('Users/me no cookie', `HTTP ${r.status}`)
  }
}

// 9. Inventory endpoint with auth
{
  const r = await request('/api/inventory?page=1&limit=5')
  if (r.status === 200 && r.body?.items) {
    ok('GET /api/inventory with cookie → 200, items present')
  } else {
    fail('Inventory with auth', `HTTP ${r.status}: ${JSON.stringify(r.body)}`)
  }
}

// 10. Stats endpoint with auth
{
  const r = await request('/api/stats')
  if (r.status === 200 && r.body?.total_items !== undefined) {
    ok('GET /api/stats with cookie → 200')
  } else {
    fail('Stats with auth', `HTTP ${r.status}: ${JSON.stringify(r.body)}`)
  }
}

// 11. Logout
{
  const before = cookies
  const r = await request('/api/auth/logout', { method: 'POST' })
  if (r.status === 200) {
    ok('POST /api/auth/logout → 200')
  } else {
    fail('Logout', `HTTP ${r.status}`)
  }
  // After logout, cookie should be cleared
  if (!cookies || !cookies.includes('auth_token=')) {
    ok('Auth cookie cleared after logout')
  } else {
    fail('Cookie cleared', `Still has: ${cookies.slice(0, 80)}...`)
  }
}

// 12. After logout — protected endpoint should fail
{
  const r = await request('/api/users/me')
  if (r.status === 401) {
    ok('GET /api/users/me after logout → 401')
  } else {
    fail('After logout', `HTTP ${r.status}`)
  }
}

// 13. Full round-trip: login → data → logout
{
  const loginR = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })
  if (loginR.status !== 200) {
    fail('Round-trip login', `HTTP ${loginR.status}`)
  } else {
    ok('Round-trip: login')
    const dataR = await request('/api/stats')
    if (dataR.status === 200 && dataR.body?.total_items !== undefined) {
      ok('Round-trip: GET /api/stats → 200')
    } else {
      fail('Round-trip stats', `HTTP ${dataR.status}`)
    }
    const itemsR = await request('/api/inventory?page=1&limit=3')
    if (itemsR.status === 200 && itemsR.body?.items) {
      ok('Round-trip: GET /api/inventory → 200')
    } else {
      fail('Round-trip inventory', `HTTP ${itemsR.status}`)
    }
    const logoutR = await request('/api/auth/logout', { method: 'POST' })
    if (logoutR.status === 200) ok('Round-trip: logout')
    else fail('Round-trip logout', `HTTP ${logoutR.status}`)
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`)
console.log(`   Results: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(50)}\n`)
process.exit(failed > 0 ? 1 : 0)

})()
