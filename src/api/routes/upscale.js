import { z } from 'zod';
import { ulid } from 'ulid';
import * as db from '../../storage/database.js';

const upscaleSchema = z.object({
  job_id: z.string().min(1),
  index: z.number().int().min(1).max(4),
  webhook_url: z.string().url().optional(),
});

export async function upscaleRoutes(app, { queue }) {
  app.post('/upscale', async (request, reply) => {
    const parsed = upscaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { job_id: parentJobId, index, webhook_url } = parsed.data;

    const parentJob = db.getJob(parentJobId);
    if (!parentJob) {
      return reply.code(404).send({ error: 'Parent job not found' });
    }
    if (parentJob.status !== 'completed') {
      return reply.code(400).send({ error: 'Parent job is not completed' });
    }
    if (parentJob.type !== 'imagine') {
      return reply.code(400).send({ error: 'Can only upscale from imagine jobs' });
    }

    const id = ulid();
    const job = db.createJob({
      id,
      type: 'upscale',
      prompt: parentJob.prompt,
      parameters: { index },
      parent_job_id: parentJobId,
      webhook_url,
    });
    queue.submit(job);

    return reply.code(202).send({
      job_id: id,
      status: 'pending',
      message: 'Upscale job submitted',
    });
  });
}
