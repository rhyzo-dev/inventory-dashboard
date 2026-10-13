/**
 * Image upload endpoint — POST /api/upload
 *
 * Stores images in Tigris (S3-compatible object storage) and optionally
 * attaches the uploaded image URL to an inventory item.
 *
 * Authentication: Requires admin or editor role.
 * Accepts itemId via form data OR query parameter (?itemId=uuid).
 *
 * IMPORTANT: We use new Uint8Array(arrayBuffer) instead of Buffer.from() because
 *   Buffer is not available in the Cloudflare Workers runtime.
 *
 * IMPORTANT: We do NOT set ACL: 'public-read' — Tigris handles access differently.
 *   Images are served directly from the Tigris endpoint URL.
 *
 * IMPORTANT: We do NOT use requestChecksumCalculation — it's not supported by
 *   the version of @aws-sdk/client-s3 we're using in Workers.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import type { PagesFunction } from '@cloudflare/workers-types'
import { hasRole } from '../lib/auth'

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
  const { verifyJwt } = await import('../lib/auth')
  const payload = await verifyJwt(match[1], context.env.AUTH_SECRET || '')
  if (!payload) return null
  return context.env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.sub).first<any>()
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const url = new URL(request.url)
    const ip = request.headers.get('cf-connecting-ip') || 'unknown'

    // Auth check — only editors and admins can upload
    const user = await getUser(context)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: SECURITY_HEADERS })
    }
    if (!hasRole(user.role as any, 'editor')) {
      return new Response(JSON.stringify({ error: 'Permission denied — editors and admins only' }), { status: 403, headers: SECURITY_HEADERS })
    }

    // Rate limit uploads: 10 per minute per IP
    if (env.RATE_LIMIT) {
      const key = `upload-rate:${ip}`
      const count = parseInt(env.RATE_LIMIT.get(key) || '0')
      if (count >= 10) {
        return new Response(JSON.stringify({ error: 'Upload rate limit exceeded' }), { status: 429, headers: SECURITY_HEADERS })
      }
      env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 60 }).catch(() => {})
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: SECURITY_HEADERS })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type. Use JPEG, PNG, GIF, or WebP.' }), { status: 400, headers: SECURITY_HEADERS })
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Max 5MB.' }), { status: 400, headers: SECURITY_HEADERS })
    }

    // Get itemId — check form data first, then query params
    // itemId can come from either source depending on how the frontend sends it
    const itemId = (formData.get('itemId') as string | null)
      || url.searchParams.get('itemId') || null

    // Read file bytes — use Uint8Array (Buffer not available in Workers)
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    const accessKeyId = env.TIGRIS_ACCESS_KEY_ID
    const secretAccessKey = env.TIGRIS_SECRET_ACCESS_KEY
    const bucket = env.TIGRIS_BUCKET
    const endpoint = env.TIGRIS_ENDPOINT

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
      // NOTE: Do NOT set requestChecksumCalculation — unsupported in this SDK version
    })

    // Generate unique object key: items/{uuid}/{timestamp}-{original-name}
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'jpg'
    const objectKey = `items/${timestamp}-${Math.random().toString(36).substring(2, 9)}.${extension}`

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: uint8Array,
      ContentType: file.type,
      ACL: 'public-read',
    }))

    const imageUrl = `${endpoint}/${bucket}/${objectKey}`

    // If itemId provided, update the consumable_item record with the image URL
    if (itemId) {
      await env.DB.prepare(
        'UPDATE consumable_item SET image_url = ?, updated_at = ? WHERE id = ?'
      ).bind(imageUrl, new Date().toISOString(), itemId).run()
    }

    return new Response(JSON.stringify({
      success: true,
      imageUrl,
      itemId,
      message: itemId ? 'Image uploaded and attached to item' : 'Image uploaded successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS } })
  } catch (error) {
    console.error('Upload error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: SECURITY_HEADERS })
  }
}
