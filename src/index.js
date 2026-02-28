import pino from 'pino';
import { getConfig } from './config.js';
import { initDatabase } from './storage/database.js';
import { createDiscordClient, loginDiscord } from './discord/client.js';
import { initCommands, discoverCommands } from './discord/commands.js';
import { MessageMonitor } from './discord/monitor.js';
import { QueueManager } from './queue/manager.js';
import { Worker } from './queue/worker.js';
import { createApiServer } from './api/server.js';
import { createMcpServer, createMcpApp } from './mcp/server.js';
import { WebhookDispatcher } from './webhooks/dispatcher.js';
import { downloadImage } from './storage/images.js';
import { startCleanup } from './storage/cleanup.js';
import * as db from './storage/database.js';

const config = getConfig();
const logger = pino({
  level: config.logging.level,
  transport: { target: 'pino-pretty', options: { colorize: true } },
});

async function main() {
  // 1. Initialize database
  logger.info('Initializing database...');
  await initDatabase(config.storage.database_path);

  // 2. Create queue manager
  const queue = new QueueManager(config, logger);

  // 3. Create webhook dispatcher
  const webhooks = new WebhookDispatcher(config, logger);

  // 4. Connect Discord client
  logger.info('Connecting to Discord...');
  const discord = createDiscordClient(config, logger);
  initCommands(config.discord.token);
  await loginDiscord(discord, config.discord.token);

  // 5. Discover Midjourney commands (hardcoded IDs, optionally refreshed via user token)
  logger.info('Loading Midjourney commands...');
  try {
    const commands = await discoverCommands(config.discord.guild_id, config.discord.channel_id, config.discord.user_token);
    logger.info({ commands: Object.keys(commands) }, 'MJ commands ready');
  } catch (err) {
    logger.warn({ err: err.message }, 'Live discovery failed, using hardcoded command IDs');
  }

  // 6. Start message monitor
  const monitor = new MessageMonitor(discord, config, logger);
  monitor.start();

  // Wire monitor events to queue manager
  monitor.on('job:progress', (data) => queue.handleProgress(data));
  monitor.on('job:complete', (data) => queue.handleComplete(data));
  monitor.on('job:error', (data) => queue.handleError(data));
  monitor.on('job:describe', (data) => queue.handleDescribe(data));

  // Wire queue events to webhooks + image download
  queue.on('job:completed', async ({ job }) => {
    // Download image locally if available
    if (job.image_url) {
      try {
        const localPath = await downloadImage(job.image_url, config.storage.image_dir, job.id, job.prompt);
        db.updateJob(job.id, { local_image_path: localPath });
        job.local_image_path = localPath;
        logger.info({ jobId: job.id, localPath }, 'Image downloaded');
      } catch (err) {
        logger.error({ err, jobId: job.id }, 'Failed to download image');
      }
    }
    webhooks.dispatch(job);
  });

  queue.on('job:failed', ({ job }) => {
    webhooks.dispatch(job);
  });

  // 7. Start worker
  const worker = new Worker(config, queue, logger);
  worker.start();

  // 8. Start REST API
  const api = await createApiServer(config, { logger, discord, queue });
  await api.listen({ port: config.api.port, host: config.api.host });
  logger.info(`REST API listening on http://${config.api.host}:${config.api.port}`);

  // 9. Start MCP server
  const mcpServer = createMcpServer(config, { queue, logger });
  const mcpApp = createMcpApp(mcpServer, logger);
  const mcpHttpServer = await new Promise((resolve, reject) => {
    const server = mcpApp.listen(config.mcp.port, config.mcp.host, () => {
      logger.info(`MCP server listening on http://${config.mcp.host}:${config.mcp.port}/mcp`);
      resolve(server);
    });
    server.on('error', reject);
  });

  // 10. Start cleanup scheduler
  const cleanupInterval = startCleanup(config, logger);

  // Graceful shutdown
  async function shutdown(signal) {
    logger.info({ signal }, 'Shutting down...');
    worker.stop();
    queue.shutdown();
    if (cleanupInterval) clearInterval(cleanupInterval);
    await api.close();
    mcpHttpServer.close();
    discord.destroy();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
