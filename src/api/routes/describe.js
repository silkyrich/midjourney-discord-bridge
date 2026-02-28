import { z } from 'zod';
import { ulid } from 'ulid';
import * as db from '../../storage/database.js';

const describeSchema = z.object({
  image_url: z.string().url(),
  webhook_url: z.string().url().optional(),
});

export async function describeRoutes(app, { queue }) {
  app.post('/describe', async (request, reply) => {
    const parsed = describeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { image_url, webhook_url } = parsed.data;
    const id = ulid();

    const job = db.createJob({
      id,
      type: 'describe',
      parameters: { image_url },
      webhook_url,
    });
    queue.submit(job);

    return reply.code(202).send({
      job_id: id,
      status: 'pending',
      message: 'Describe job submitted',
    });
  });
}
