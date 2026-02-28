import { z } from 'zod';
import { ulid } from 'ulid';
import * as db from '../../storage/database.js';

const blendSchema = z.object({
  image_urls: z.array(z.string().url()).min(2).max(5),
  dimension: z.enum(['portrait', 'square', 'landscape']).optional(),
  webhook_url: z.string().url().optional(),
});

export async function blendRoutes(app, { queue }) {
  app.post('/blend', async (request, reply) => {
    const parsed = blendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { image_urls, dimension, webhook_url } = parsed.data;

    const id = ulid();
    const job = db.createJob({
      id,
      type: 'blend',
      parameters: { image_urls, dimension },
      webhook_url,
    });
    queue.submit(job);

    return reply.code(202).send({
      job_id: id,
      status: 'pending',
      message: 'Blend job submitted',
    });
  });
}
