/**
 * Catch-all middleware for /api/images/*
 * Serves images from Tigris S3 storage through the API proxy.
 */
import type { PagesFunction } from '@cloudflare/workers-types'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

// DOMParser polyfill required by AWS SDK v3 in Workers runtime
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class DOMParser {
    parseFromString(str: string, _type: string) {
      return {
        documentElement: { textContent: str },
        getElementsByTagName: () => [],
      } as unknown as Document
    }
  }
}

export const onRequest: PagesFunction = async (context) => {
  try {
    const { env, request } = context
    const url = new URL(request.url)
    const key = url.pathname.slice('/api/images/'.length)

    if (!key || !env.TIGRIS_ENDPOINT || !env.TIGRIS_BUCKET || !env.TIGRIS_ACCESS_KEY_ID) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: env.TIGRIS_ENDPOINT,
      credentials: {
        accessKeyId: env.TIGRIS_ACCESS_KEY_ID,
        secretAccessKey: env.TIGRIS_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    })

    const result = await s3Client.send(new GetObjectCommand({
      Bucket: env.TIGRIS_BUCKET,
      Key: key,
    }))

    if (!result.Body) {
      return new Response(JSON.stringify({ error: 'Image not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      })
    }

    const contentType = result.ContentType || 'application/octet-stream'
    const chunks: Uint8Array[] = []
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    let totalLen = 0
    for (const c of chunks) totalLen += c.length
    const combined = new Uint8Array(totalLen)
    let offset = 0
    for (const c of chunks) { combined.set(c, offset); offset += c.length }

    return new Response(combined, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('[image-proxy] Error:', error)
    return new Response(JSON.stringify({ error: 'Image not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }
}
