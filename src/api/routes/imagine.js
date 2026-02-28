import { z } from 'zod';
import { ulid } from 'ulid';
import * as db from '../../storage/database.js';

const imagineSchema = z.object({
  prompt: z.string().min(1).max(4000),

  // Image inputs
  image_prompts: z.array(z.string().url()).max(5).optional()
    .describe('Image URLs to use as image prompts (prepended to prompt)'),
  sref: z.array(z.string().url()).max(5).optional()
    .describe('Style reference image URLs (--sref)'),
  cref: z.array(z.string().url()).max(5).optional()
    .describe('Character reference image URLs (--cref)'),

  // Core parameters
  ar: z.string().regex(/^\d+:\d+$/).optional()
    .describe('Aspect ratio (e.g. "16:9", "3:2")'),
  v: z.string().optional()
    .describe('Model version (e.g. "6.0", "5.2")'),
  style: z.string().optional()
    .describe('Style preset (e.g. "raw")'),
  quality: z.number().min(0.25).max(2).optional()
    .describe('Quality (0.25, 0.5, 1, 2). Alias: --q'),
  stylize: z.number().int().min(0).max(1000).optional()
    .describe('Stylization amount (0-1000, default 100). Alias: --s'),
  chaos: z.number().int().min(0).max(100).optional()
    .describe('Variety/randomness (0-100)'),
  weird: z.number().int().min(0).max(3000).optional()
    .describe('Weirdness (0-3000)'),
  seed: z.number().int().min(0).max(4294967295).optional()
    .describe('Seed for reproducibility'),
  no: z.string().optional()
    .describe('Negative prompt — things to exclude'),
  stop: z.number().int().min(10).max(100).optional()
    .describe('Stop generation at percentage (10-100)'),
  tile: z.boolean().optional()
    .describe('Generate seamless tiling pattern'),
  repeat: z.number().int().min(1).max(40).optional()
    .describe('Repeat the prompt N times (1-40)'),

  // Reference weights
  iw: z.number().min(0).max(3).optional()
    .describe('Image prompt weight (0-3, default 1)'),
  sw: z.number().int().min(0).max(1000).optional()
    .describe('Style reference weight (0-1000, default 100)'),
  cw: z.number().int().min(0).max(100).optional()
    .describe('Character reference weight (0-100, default 100)'),

  // Personalization
  p: z.boolean().optional()
    .describe('Enable personalization (--p)'),
  personalize: z.string().optional()
    .describe('Personalization code (--personalize <code>)'),

  webhook_url: z.string().url().optional(),
});

/**
 * Build the full MJ prompt string from structured fields.
 */
function buildPrompt(data) {
  const parts = [];

  // Image prompts go first
  if (data.image_prompts?.length) {
    parts.push(...data.image_prompts);
  }

  // Text prompt
  parts.push(data.prompt);

  // Style/character references
  if (data.sref?.length) parts.push(`--sref ${data.sref.join(' ')}`);
  if (data.cref?.length) parts.push(`--cref ${data.cref.join(' ')}`);

  // Parameters
  if (data.ar) parts.push(`--ar ${data.ar}`);
  if (data.v) parts.push(`--v ${data.v}`);
  if (data.style) parts.push(`--style ${data.style}`);
  if (data.quality != null) parts.push(`--q ${data.quality}`);
  if (data.stylize != null) parts.push(`--s ${data.stylize}`);
  if (data.chaos != null) parts.push(`--chaos ${data.chaos}`);
  if (data.weird != null) parts.push(`--weird ${data.weird}`);
  if (data.seed != null) parts.push(`--seed ${data.seed}`);
  if (data.no) parts.push(`--no ${data.no}`);
  if (data.stop != null) parts.push(`--stop ${data.stop}`);
  if (data.tile) parts.push('--tile');
  if (data.repeat != null) parts.push(`--repeat ${data.repeat}`);
  if (data.iw != null) parts.push(`--iw ${data.iw}`);
  if (data.sw != null) parts.push(`--sw ${data.sw}`);
  if (data.cw != null) parts.push(`--cw ${data.cw}`);
  if (data.p) parts.push('--p');
  if (data.personalize) parts.push(`--personalize ${data.personalize}`);

  return parts.join(' ');
}

export async function imagineRoutes(app, { queue }) {
  app.post('/imagine', async (request, reply) => {
    const parsed = imagineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const fullPrompt = buildPrompt(parsed.data);
    const id = ulid();

    const job = db.createJob({
      id,
      type: 'imagine',
      prompt: fullPrompt,
      parameters: {
        // Store structured params for reference
        ...(parsed.data.ar && { ar: parsed.data.ar }),
        ...(parsed.data.v && { v: parsed.data.v }),
        ...(parsed.data.image_prompts?.length && { image_prompts: parsed.data.image_prompts }),
        ...(parsed.data.sref?.length && { sref: parsed.data.sref }),
        ...(parsed.data.cref?.length && { cref: parsed.data.cref }),
      },
      webhook_url: parsed.data.webhook_url,
    });
    queue.submit(job);

    return reply.code(202).send({
      job_id: id,
      status: 'pending',
      prompt: fullPrompt,
      message: 'Job submitted successfully',
    });
  });
}
