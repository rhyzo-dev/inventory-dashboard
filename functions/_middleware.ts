// Optional: Simple shared secret auth middleware
// Enable by setting SHARED_SECRET in Cloudflare Pages env vars
// Then add header: X-API-Key: your-secret

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | void> {
    const sharedSecret = env.SHARED_SECRET;

    if (!sharedSecret) {
      return; // No auth configured, proceed
    }

    const authHeader = request.headers.get('X-API-Key') ||
                       request.headers.get('Authorization')?.replace('Bearer ', '');

    if (authHeader !== sharedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};