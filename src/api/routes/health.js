export async function healthRoutes(app, { discord, queue }) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      discord: {
        connected: discord?.isReady() ?? false,
        ping: discord?.ws?.ping ?? null,
      },
      queue: {
        active: queue?.activeCount() ?? 0,
        pending: queue?.pendingCount() ?? 0,
      },
    };
  });
}
