import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { authHook } from './middleware/auth.js';
import { healthRoutes } from './routes/health.js';
import { imagineRoutes } from './routes/imagine.js';
import { upscaleRoutes } from './routes/upscale.js';
import { variationRoutes } from './routes/variation.js';
import { describeRoutes } from './routes/describe.js';
import { jobsRoutes } from './routes/jobs.js';

export async function createApiServer(config, { logger, discord, queue }) {
  const app = Fastify({
    loggerInstance: logger,
  });

  await app.register(cors, { origin: true });

  // Serve images statically
  const imageDir = resolve(config.storage.image_dir);
  if (!existsSync(imageDir)) mkdirSync(imageDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: imageDir,
    prefix: '/images/',
    decorateReply: false,
  });

  // Auth for /api/* routes
  app.addHook('onRequest', authHook(config.api.api_key));

  // Register route plugins
  await app.register(healthRoutes, { prefix: '/api', discord, queue });
  await app.register(imagineRoutes, { prefix: '/api', queue });
  await app.register(upscaleRoutes, { prefix: '/api', queue });
  await app.register(variationRoutes, { prefix: '/api', queue });
  await app.register(describeRoutes, { prefix: '/api', queue });
  await app.register(jobsRoutes, { prefix: '/api', config });

  return app;
}
