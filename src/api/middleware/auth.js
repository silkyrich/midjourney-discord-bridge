const PUBLIC_PATHS = ['/api/health', '/images/'];

export function authHook(apiKey) {
  return async (request, reply) => {
    const path = request.url;

    // Skip auth for public paths and non-api paths
    if (PUBLIC_PATHS.some(p => path.startsWith(p)) || !path.startsWith('/api/')) {
      return;
    }

    if (!apiKey) return; // No key configured = open access

    const token =
      request.headers.authorization?.replace(/^Bearer\s+/i, '') ||
      request.headers['x-api-key'];

    if (token !== apiKey) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing API key' });
    }
  };
}
