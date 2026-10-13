/**
 * Inventory item detail endpoint — handles PUT (update) and DELETE.
 *
 * Route: /api/inventory/[id]
 *   PUT    — Update an existing item (admin + editor only)
 *   DELETE — Remove an item (admin only)
 *
 * IMPORTANT: The [id] filename (not [id].ts at root) makes this a parameterized
 *   route in Cloudflare Pages Functions. GET requests for a single item could
 *   be added here too if needed.
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import { hasRole } from '../../lib/auth'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

/** Extract user from auth cookie, return null if not authenticated */
async function getUser(context: any): Promise<any | null> {
  const cookieHeader = context.request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/)
  if (!match) return null
  const { verifyJwt } = await import('../../lib/auth')
  const payload = await verifyJwt(match[1], context.env.AUTH_SECRET || '')
  if (!payload) return null
  return context.env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.sub).first<any>()
}

/** Require any authenticated user */
async function requireAuth(context: any): Promise<any | Response> {
  const user = await getUser(context)
  if (!user) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: SECURITY_HEADERS })
  return user
}

/** Require admin or editor */
async function requireWriteAccess(context: any): Promise<any | Response> {
  const user = await requireAuth(context)
  if (user instanceof Response) return user
  if (!hasRole(user.role as any, 'editor')) {
    return new Response(JSON.stringify({ error: 'Permission denied — editors and admins only' }), { status: 403, headers: SECURITY_HEADERS })
  }
  return user
}

/** Require admin */
async function requireAdmin(context: any): Promise<any | Response> {
  const user = await requireAuth(context)
  if (user instanceof Response) return user
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: SECURITY_HEADERS })
  }
  return user
}

/** Validate that id looks like a UUID (not a bare integer or empty) */
function isValidUUID(id: string | null): boolean {
  if (!id || id.length < 5) return false
  if (/^\d+$/.test(id)) return false
  return true
}

/** Sanitize string input */
function sanitize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Parse JSON body, return { body } or a 400 Response */
async function parseBody(request: Request): Promise<{ body: unknown; error?: Response }> {
  let body
  try {
    body = await request.json()
  } catch {
    return { error: new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: SECURITY_HEADERS }) }
  }
  return { body }
}

/** Delete an object from Tigris/S3 given its full URL */
async function deleteFromStorage(env: any, imageUrl: string): Promise<void> {
  if (!imageUrl || !env.TIGRIS_ENDPOINT || !env.TIGRIS_BUCKET || !env.TIGRIS_ACCESS_KEY_ID) return
  // URL format: https://t3.storage.dev/bucket-name/items/...
  const bucketName = env.TIGRIS_BUCKET
  const basePath = `/${bucketName}/`
  const keyStart = parsed.pathname.indexOf(basePath) + basePath.length
  const key = parsed.pathname.slice(keyStart)
  if (!key) return

  const s3Client = new S3Client({
    region: 'auto',
    endpoint: env.TIGRIS_ENDPOINT,
    credentials: {
      accessKeyId: env.TIGRIS_ACCESS_KEY_ID,
      secretAccessKey: env.TIGRIS_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  })
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  }))
}

// ─── PUT: Update item ──────────────────────────────────────────────────────────

export const onRequestPut: PagesFunction = async (context) => {
  const user = await requireWriteAccess(context)
  if (user instanceof Response) return user

  try {
    const { env, request } = context
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop() || null

    if (!isValidUUID(id)) {
      return new Response(JSON.stringify({ error: 'Invalid item ID — must be a UUID' }), { status: 400, headers: SECURITY_HEADERS })
    }

    const { body, error } = await parseBody(request)
    if (error) return error

    const b = body as Record<string, unknown>
    const now = new Date().toISOString()

    const updates: string[] = []
    const values: unknown[] = []

    const stringFields = ['sku', 'name', 'description', 'category', 'bin_location', 'specification']
    for (const field of stringFields) {
      if (b[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(sanitize(String(b[field])))
      }
    }

    // Handle image_url specially: if clearing, delete the file from Tigris first
    if (b.image_url !== undefined) {
      const newUrl = b.image_url === '' || b.image_url === null ? null : sanitize(String(b.image_url))
      // If removing an image, look up and delete the old one
      if (!newUrl) {
        const oldItem = await env.DB.prepare('SELECT image_url FROM consumable_item WHERE id = ?').bind(id).first<{ image_url: string | null }>()
        if (oldItem?.image_url) {
          await deleteFromStorage(env, oldItem.image_url).catch(e => console.error('Image cleanup failed:', e))
        }
      }
      updates.push('image_url = ?')
      values.push(newUrl)
    }

    const numberFields = ['quantity', 'min_threshold', 'max_threshold']
    for (const field of numberFields) {
      if (b[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(Number(b[field]) || 0)
      }
    }

    const dateFields = ['production_date', 'expiry_date']
    for (const field of dateFields) {
      if (b[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(b[field] ? String(b[field]) : null)
      }
    }

    updates.push('updated_at = ?', 'updater_id = ?')
    values.push(now, user.id)
    values.push(id)

    const sql = `UPDATE consumable_item SET ${updates.join(', ')} WHERE id = ?`
    await env.DB.prepare(sql).bind(...values).run()

    return new Response(JSON.stringify({
      id: id,
      message: 'Item updated successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS } })
  } catch (error) {
    console.error('Inventory PUT error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}

// ─── DELETE: Delete item ───────────────────────────────────────────────────────

export const onRequestDelete: PagesFunction = async (context) => {
  const user = await requireAdmin(context)
  if (user instanceof Response) return user

  try {
    const { env } = context
    const url = new URL(context.request.url)
    const id = url.pathname.split('/').pop() || null

    if (!isValidUUID(id)) {
      return new Response(JSON.stringify({ error: 'Invalid item ID' }), { status: 400, headers: SECURITY_HEADERS })
    }

    const result = await env.DB.prepare('DELETE FROM consumable_item WHERE id = ?').bind(id).run()

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: 'Item not found' }), { status: 404, headers: SECURITY_HEADERS })
    }

    return new Response(JSON.stringify({ message: 'Item deleted successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
    })
  } catch (error) {
    console.error('Inventory DELETE error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}
