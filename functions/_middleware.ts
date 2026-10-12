// Optional: Simple shared secret auth middleware
// Enable by setting SHARED_SECRET in Cloudflare Pages env vars
// Then add header: X-API-Key: your-secret

export const onRequest: PagesFunction = async (context) => {
  const sharedSecret = context.env.SHARED_SECRET;

  if (!sharedSecret) {
    return await context.next(); // No auth configured, proceed
  }

  const authHeader = context.request.headers.get('X-API-Key') ||
                     context.request.headers.get('Authorization')?.replace('Bearer ', '');

  if (authHeader !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return await context.next();
};
