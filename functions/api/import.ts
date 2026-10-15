/**
 * Bulk import — POST /api/import
 *
 * Accepts a JSON body `{ rows: ImportRow[], dry_run: boolean }` and either:
 *   - dry_run: true  → validates + dedups and returns a per-row plan (NO writes)
 *   - dry_run: false → inserts the create-eligible rows in one D1 transaction
 *
 * Duplicate policy ("skip & report" — chosen): a row whose lot identity
 *   (sku + name + bin_location + specification + production_date + expiry_date,
 *   the same key the Add form's duplicate guard uses) already exists — in the DB,
 *   or in an earlier row of the same file — is SKIPPED, never overwritten. Re-running
 *   the same file is a no-op for those rows (idempotent), so an import is safe to retry.
 *
 * The endpoint is intentionally thin: file parsing (xlsx / csv) happens in the browser
 * (SheetJS); the client posts plain JSON rows. That keeps all the messy spreadsheet
 * handling off the Cloudflare runtime.
 */
import type { PagesFunction } from '@cloudflare/workers-types'
import { hasRole } from '../lib/auth'

const H = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

const MAX_ROWS = 1000
const SKU_RE = /^[a-zA-Z0-9\-_]{1,50}$/

// ─── Auth (same pattern as functions/api/inventory.ts) ──────────────────────────
async function getUser(context: any): Promise<any | null> {
  const cookieHeader = context.request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null
  const { verifyJwt } = await import('../lib/auth')
  const payload = await verifyJwt(match[1], context.env.AUTH_SECRET || '')
  if (!payload) return null
  return context.env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.sub).first<any>()
}

async function requireWriteAccess(context: any): Promise<any | Response> {
  const user = await getUser(context)
  if (!user) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: H })
  if (!hasRole(user.role as any, 'editor')) {
    return new Response(JSON.stringify({ error: 'Permission denied — editors and admins only' }), { status: 403, headers: H })
  }
  return user
}

// ─── Per-row normalization + validation ──────────────────────────────────────────

/** A fully-normalized row ready to insert. All text trimmed, dates ISO or null. */
interface CleanRow {
  sku: string
  name: string
  specification: string
  category: string
  unit: string
  quantity: number
  min_threshold: number
  max_threshold: number
  bin_location: string
  production_date: string | null
  expiry_date: string | null
  description: string
}

type RowStatus = 'create' | 'skip_duplicate' | 'error'
interface PlanRow {
  index: number
  sku: string
  status: RowStatus
  reason?: string
}

function esc(s: unknown): string {
  return String(s ?? '').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function empty(v: unknown): string {
  const s = String(v ?? '').trim()
  return s === '' || s.toLowerCase() === 'null' ? '' : s
}

/** Coerce a numeric field; empty → 0, otherwise must be finite. Returns [value, ok]. */
function toNumber(v: unknown, fallback: number): [number, boolean] {
  const s = empty(v)
  if (s === '') return [fallback, true]
  const n = Number(s)
  if (!Number.isFinite(n)) return [0, false]
  return [n, true]
}

/** Accept 'YYYY-MM-DD' or a longer ISO string (take the date part). '' → null. */
function toIsoDate(v: unknown): { value: string | null; ok: boolean } {
  const s = empty(v)
  if (s === '') return { value: null, ok: true }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { value: null, ok: false }
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  // Reject impossible dates like 2026-02-30.
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    return { value: null, ok: false }
  }
  return { value: `${m[1]}-${m[2]}-${m[3]}`, ok: true }
}

/** Validate + normalize a raw row. Returns a clean row, or a reason string. */
function normalize(raw: Record<string, unknown>): CleanRow | string {
  const sku = empty(raw.sku)
  if (!sku) return 'SKU is required'
  if (!SKU_RE.test(sku)) return 'SKU must be alphanumeric (letters, numbers, - _), max 50 chars'

  const name = empty(raw.name)
  if (!name) return 'Name is required'

  const [quantity, qOk] = toNumber(raw.quantity, 0)
  if (!qOk) return 'Quantity must be a number'
  if (quantity < 0) return 'Quantity must be 0 or more'

  const [minT, minOk] = toNumber(raw.min_threshold, 0)
  const [maxT, maxOk] = toNumber(raw.max_threshold, 0)
  if (!minOk || !maxOk) return 'Min / max threshold must be numbers (blank = 0)'
  if (maxT < minT) return 'Max threshold must be ≥ min threshold'

  const prod = toIsoDate(raw.production_date)
  if (!prod.ok) return 'Production date must be YYYY-MM-DD'
  const exp = toIsoDate(raw.expiry_date)
  if (!exp.ok) return 'Expiry date must be YYYY-MM-DD'
  if (prod.value && exp.value && exp.value < prod.value) {
    return 'Expiry date must be after production date'
  }

  return {
    sku,
    name,
    specification: esc(raw.specification),
    category: esc(raw.category),
    unit: esc(raw.unit),
    quantity,
    min_threshold: minT,
    max_threshold: maxT,
    bin_location: esc(raw.bin_location),
    production_date: prod.value,
    expiry_date: exp.value,
    description: esc(raw.description),
  }
}

/** Lot identity — the "same physical item" key used for skip-duplicate
 *  detection. Mirrors the Add form's guard:
 *  sku + name + bin + specification + production + expiry. */
function lotKey(r: { sku: string; name: string; specification: string; bin_location: string; production_date: string | null; expiry_date: string | null }): string {
  return [r.sku, r.name, r.specification, r.bin_location, r.production_date || '', r.expiry_date || ''].join('')
}

// ─── Planning (used by both dry_run and real import) ────────────────────────────
async function plan(env: any, rows: Record<string, unknown>[], userId: string, now: string) {
  // 1) Normalize every row; validation errors are terminal for that row.
  const normalized: Array<{ row: Record<string, unknown>; index: number; clean: CleanRow | null; error?: string }> =
    rows.map((row, index) => {
      const out = normalize(row)
      return { row, index, clean: typeof out === 'string' ? null : out, error: typeof out === 'string' ? out : undefined }
    })

  // 2) Load existing lot keys for the SKUs in this batch (bounded, so it's cheap).
  const skus = [...new Set(normalized.filter(n => n.clean).map(n => n.clean!.sku))]
  const existing = new Set<string>()
  if (skus.length) {
    const inList = skus.map(() => '?').join(',')
    const res = await env.DB.prepare(
      `SELECT sku, COALESCE(name,'') as name, COALESCE(specification,'') as specification,
              COALESCE(bin_location,'') as bin_location,
              COALESCE(production_date,'') as production_date, COALESCE(expiry_date,'') as expiry_date
       FROM consumable_item WHERE sku IN (${inList})`
    ).bind(...skus).all<{ sku: string; name: string; specification: string; bin_location: string; production_date: string; expiry_date: string }>()
    for (const r of res.results || []) existing.add(lotKey(r))
  }

  // 3) Decide per row: error → status error; dup (DB or earlier in file) → skip; else create.
  const seenInBatch = new Set<string>()
  const results: PlanRow[] = []
  const creates: CleanRow[] = []
  let nSkip = 0
  let nError = 0

  for (const { row, index, clean, error } of normalized) {
    const skuLabel = empty(row.sku) || '(no SKU)'
    if (!clean) {
      results.push({ index, sku: skuLabel, status: 'error', reason: error })
      nError++
      continue
    }
    const key = lotKey(clean)
    if (existing.has(key) || seenInBatch.has(key)) {
      results.push({ index, sku: skuLabel, status: 'skip_duplicate', reason: 'Matches an existing item (or an earlier row in this file)' })
      nSkip++
      continue
    }
    seenInBatch.add(key)
    creates.push(clean)
    results.push({ index, sku: skuLabel, status: 'create' })
  }

  return { creates, results, summary: { total: rows.length, create: creates.length, skip: nSkip, error: nError }, userId, now }
}

// ─── Handler ─────────────────────────────────────────────────────────────────────
export const onRequestPost: PagesFunction = async (context) => {
  const user = await requireWriteAccess(context)
  if (user instanceof Response) return user

  try {
    const { env, request } = context
    const body: any = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.rows)) {
      return new Response(JSON.stringify({ error: 'Body must be { rows: [...], dry_run: boolean }' }), { status: 400, headers: H })
    }
    if (body.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No rows to import' }), { status: 400, headers: H })
    }
    if (body.rows.length > MAX_ROWS) {
      return new Response(JSON.stringify({ error: `Too many rows — import up to ${MAX_ROWS} at a time` }), { status: 400, headers: H })
    }

    const dryRun = !!body.dry_run
    const rows: Record<string, unknown>[] = body.rows
    const now = new Date().toISOString()
    const p = await plan(env, rows, user.id, now)

    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true,
        results: p.results,
        summary: { total: p.summary.total, create: p.summary.create, skip: p.summary.skip, error: p.summary.error },
      }), { status: 200, headers: H })
    }

    // Real import: insert the create-eligible rows atomically.
    if (p.creates.length === 0) {
      return new Response(JSON.stringify({
        dry_run: false,
        created: 0,
        skipped: p.summary.skip,
        errors: p.summary.error,
        message: 'Nothing to import — every row was a duplicate or invalid',
      }), { status: 200, headers: H })
    }

    const insertSql = `
      INSERT INTO consumable_item
        (id, facility_id, sku, name, description, category, unit, quantity, min_threshold, max_threshold,
         bin_location, production_date, expiry_date, image_url, creator_id, updater_id, created_at, updated_at, specification)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const statements = p.creates.map((r) =>
      env.DB.prepare(insertSql).bind(
        crypto.randomUUID(),
        env.FACILITY_ID || null,
        r.sku, r.name, r.description || null, r.category || null, r.unit || null,
        r.quantity, r.min_threshold, r.max_threshold,
        r.bin_location || null, r.production_date, r.expiry_date,
        null, user.id, user.id, p.now, p.now, r.specification || null
      )
    )
    await env.DB.batch(statements) // single transaction — all or nothing

    return new Response(JSON.stringify({
      dry_run: false,
      created: p.creates.length,
      skipped: p.summary.skip,
      errors: p.summary.error,
      message: `Imported ${p.creates.length} item${p.creates.length === 1 ? '' : 's'}` +
        (p.summary.skip ? `, skipped ${p.summary.skip} duplicate${p.summary.skip === 1 ? '' : 's'}` : '') +
        (p.summary.error ? `, ${p.summary.error} errored row${p.summary.error === 1 ? '' : 's'}` : ''),
    }), { status: 200, headers: H })
  } catch (error) {
    console.error('Import POST error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: H })
  }
}
