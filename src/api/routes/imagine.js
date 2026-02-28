import { z } from 'zod';
import { ulid } from 'ulid';
import * as db from '../../storage/database.js';

const imagineSchema = z.object({
  prompt: z.string().min(1).max(4000),
  webhook_url: z.string().url().optional(),
});

export async function imagineRoutes(app, { queue }) {
  app.post('/imagine', async (request, reply) => {
    const parsed = imagineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { prompt, webhook_url } = parsed.data;
    const id = ulid();

    const job = db.createJob({ id, type: 'imagine', prompt, webhook_url });
    queue.submit(job);

    return reply.code(202).send({
      job_id: id,
      status: 'pending',
      message: 'Job submitted successfully',
    });
  });
}
