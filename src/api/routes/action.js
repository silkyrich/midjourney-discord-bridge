import { z } from 'zod';
import { ulid } from 'ulid';
import * as db from '../../storage/database.js';

const VALID_ACTIONS = [
  'reroll',
  'vary_strong', 'vary_subtle', 'vary_region',
  'upscale_subtle', 'upscale_creative', 'upscale_2x', 'upscale_4x',
  'zoom_out_2x', 'zoom_out_1_5x', 'custom_zoom',
  'pan_left', 'pan_right', 'pan_up', 'pan_down',
  'make_square',
];

const actionSchema = z.object({
  job_id: z.string().min(1),
  action: z.enum(VALID_ACTIONS),
  webhook_url: z.string().url().optional(),
});

export async function actionRoutes(app, { queue }) {
  app.post('/action', async (request, reply) => {
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { job_id: parentJobId, action, webhook_url } = parsed.data;

    const parentJob = db.getJob(parentJobId);
    if (!parentJob) {
      return reply.code(404).send({ error: 'Parent job not found' });
    }
    if (parentJob.status !== 'completed') {
      return reply.code(400).send({ error: 'Parent job is not completed' });
    }

    const buttons = parentJob.result?.buttons || {};
    if (!buttons[action]) {
      return reply.code(400).send({
        error: `Action '${action}' not available on this job`,
        available_actions: Object.keys(buttons),
      });
    }

    const id = ulid();
    const job = db.createJob({
      id,
      type: 'action',
      prompt: parentJob.prompt,
      parameters: { action },
      parent_job_id: parentJobId,
      webhook_url,
    });
    queue.submit(job);

    return reply.code(202).send({
      job_id: id,
      status: 'pending',
      message: `Action '${action}' submitted`,
    });
  });
}
