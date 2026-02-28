import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express from 'express';
import { randomUUID } from 'node:crypto';
import * as db from '../storage/database.js';

export function createMcpServer(config, { queue, logger }) {
  const mcp = new McpServer(
    { name: 'midjourney-bridge', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Tool: generate_image
  mcp.tool(
    'generate_image',
    'Generate an image using Midjourney /imagine. Returns a job ID to poll. Parameters are assembled into the MJ prompt automatically.',
    {
      prompt: z.string().describe('The text prompt for image generation'),
      image_prompts: z.array(z.string().url()).max(5).optional().describe('Image URLs as image prompts (prepended)'),
      sref: z.array(z.string().url()).max(5).optional().describe('Style reference image URLs'),
      cref: z.array(z.string().url()).max(5).optional().describe('Character reference image URLs'),
      ar: z.string().optional().describe('Aspect ratio (e.g. "16:9")'),
      v: z.string().optional().describe('Model version (e.g. "6.0")'),
      style: z.string().optional().describe('Style preset (e.g. "raw")'),
      stylize: z.number().int().min(0).max(1000).optional().describe('Stylization (0-1000)'),
      chaos: z.number().int().min(0).max(100).optional().describe('Variety (0-100)'),
      weird: z.number().int().min(0).max(3000).optional().describe('Weirdness (0-3000)'),
      no: z.string().optional().describe('Negative prompt — things to exclude'),
      seed: z.number().int().optional().describe('Seed for reproducibility'),
      tile: z.boolean().optional().describe('Seamless tiling pattern'),
      iw: z.number().min(0).max(3).optional().describe('Image prompt weight (0-3)'),
      sw: z.number().int().min(0).max(1000).optional().describe('Style reference weight (0-1000)'),
      cw: z.number().int().min(0).max(100).optional().describe('Character reference weight (0-100)'),
      quality: z.number().optional().describe('Quality (0.25, 0.5, 1, 2)'),
      stop: z.number().int().min(10).max(100).optional().describe('Stop at percentage (10-100)'),
      p: z.boolean().optional().describe('Enable personalization'),
    },
    async (params) => {
      const parts = [];
      if (params.image_prompts?.length) parts.push(...params.image_prompts);
      parts.push(params.prompt);
      if (params.sref?.length) parts.push(`--sref ${params.sref.join(' ')}`);
      if (params.cref?.length) parts.push(`--cref ${params.cref.join(' ')}`);
      if (params.ar) parts.push(`--ar ${params.ar}`);
      if (params.v) parts.push(`--v ${params.v}`);
      if (params.style) parts.push(`--style ${params.style}`);
      if (params.quality != null) parts.push(`--q ${params.quality}`);
      if (params.stylize != null) parts.push(`--s ${params.stylize}`);
      if (params.chaos != null) parts.push(`--chaos ${params.chaos}`);
      if (params.weird != null) parts.push(`--weird ${params.weird}`);
      if (params.seed != null) parts.push(`--seed ${params.seed}`);
      if (params.no) parts.push(`--no ${params.no}`);
      if (params.stop != null) parts.push(`--stop ${params.stop}`);
      if (params.tile) parts.push('--tile');
      if (params.iw != null) parts.push(`--iw ${params.iw}`);
      if (params.sw != null) parts.push(`--sw ${params.sw}`);
      if (params.cw != null) parts.push(`--cw ${params.cw}`);
      if (params.p) parts.push('--p');
      const fullPrompt = parts.join(' ');

      const { ulid } = await import('ulid');
      const id = ulid();
      const job = db.createJob({ id, type: 'imagine', prompt: fullPrompt });
      queue.submit(job);
      return { content: [{ type: 'text', text: JSON.stringify({ job_id: id, status: 'pending', prompt: fullPrompt }) }] };
    }
  );

  // Tool: upscale_image
  mcp.tool(
    'upscale_image',
    'Upscale one quadrant (1-4) of a completed imagine job.',
    {
      job_id: z.string().describe('The parent imagine job ID'),
      index: z.number().min(1).max(4).describe('Quadrant index (1-4)'),
    },
    async ({ job_id, index }) => {
      const parentJob = db.getJob(job_id);
      if (!parentJob) return { content: [{ type: 'text', text: 'Error: parent job not found' }], isError: true };
      if (parentJob.status !== 'completed') return { content: [{ type: 'text', text: 'Error: parent job not completed' }], isError: true };

      const { ulid } = await import('ulid');
      const id = ulid();
      const job = db.createJob({ id, type: 'upscale', prompt: parentJob.prompt, parameters: { index }, parent_job_id: job_id });
      queue.submit(job);
      return { content: [{ type: 'text', text: JSON.stringify({ job_id: id, status: 'pending' }) }] };
    }
  );

  // Tool: create_variation
  mcp.tool(
    'create_variation',
    'Create a variation of one quadrant (1-4) of a completed imagine job.',
    {
      job_id: z.string().describe('The parent imagine job ID'),
      index: z.number().min(1).max(4).describe('Quadrant index (1-4)'),
    },
    async ({ job_id, index }) => {
      const parentJob = db.getJob(job_id);
      if (!parentJob) return { content: [{ type: 'text', text: 'Error: parent job not found' }], isError: true };
      if (parentJob.status !== 'completed') return { content: [{ type: 'text', text: 'Error: parent job not completed' }], isError: true };

      const { ulid } = await import('ulid');
      const id = ulid();
      const job = db.createJob({ id, type: 'variation', prompt: parentJob.prompt, parameters: { index }, parent_job_id: job_id });
      queue.submit(job);
      return { content: [{ type: 'text', text: JSON.stringify({ job_id: id, status: 'pending' }) }] };
    }
  );

  // Tool: describe_image
  mcp.tool(
    'describe_image',
    'Use Midjourney /describe to get text descriptions of an image.',
    { image_url: z.string().url().describe('URL of the image to describe') },
    async ({ image_url }) => {
      const { ulid } = await import('ulid');
      const id = ulid();
      const job = db.createJob({ id, type: 'describe', parameters: { image_url } });
      queue.submit(job);
      return { content: [{ type: 'text', text: JSON.stringify({ job_id: id, status: 'pending' }) }] };
    }
  );

  // Tool: blend_images
  mcp.tool(
    'blend_images',
    'Blend 2-5 images together using Midjourney /blend.',
    {
      image_urls: z.array(z.string().url()).min(2).max(5).describe('URLs of images to blend (2-5)'),
      dimension: z.enum(['portrait', 'square', 'landscape']).optional().describe('Output dimension'),
    },
    async ({ image_urls, dimension }) => {
      const { ulid } = await import('ulid');
      const id = ulid();
      const job = db.createJob({ id, type: 'blend', parameters: { image_urls, dimension } });
      queue.submit(job);
      return { content: [{ type: 'text', text: JSON.stringify({ job_id: id, status: 'pending' }) }] };
    }
  );

  // Tool: shorten_prompt
  mcp.tool(
    'shorten_prompt',
    'Use Midjourney /shorten to analyze and shorten a prompt.',
    { prompt: z.string().describe('The prompt to shorten') },
    async ({ prompt }) => {
      const { ulid } = await import('ulid');
      const id = ulid();
      const job = db.createJob({ id, type: 'shorten', prompt });
      queue.submit(job);
      return { content: [{ type: 'text', text: JSON.stringify({ job_id: id, status: 'pending' }) }] };
    }
  );

  // Tool: perform_action
  mcp.tool(
    'perform_action',
    'Perform an action on a completed job (vary, zoom, pan, upscale creative/subtle, reroll).',
    {
      job_id: z.string().describe('The completed job ID'),
      action: z.enum([
        'reroll', 'vary_strong', 'vary_subtle', 'vary_region',
        'upscale_subtle', 'upscale_creative', 'upscale_2x', 'upscale_4x',
        'zoom_out_2x', 'zoom_out_1_5x', 'custom_zoom',
        'pan_left', 'pan_right', 'pan_up', 'pan_down', 'make_square',
      ]).describe('The action to perform'),
    },
    async ({ job_id, action }) => {
      const parentJob = db.getJob(job_id);
      if (!parentJob) return { content: [{ type: 'text', text: 'Error: parent job not found' }], isError: true };
      if (parentJob.status !== 'completed') return { content: [{ type: 'text', text: 'Error: parent job not completed' }], isError: true };

      const buttons = parentJob.result?.buttons || {};
      if (!buttons[action]) {
        const available = Object.keys(buttons).join(', ');
        return { content: [{ type: 'text', text: `Error: action '${action}' not available. Available: ${available}` }], isError: true };
      }

      const { ulid } = await import('ulid');
      const id = ulid();
      const job = db.createJob({ id, type: 'action', prompt: parentJob.prompt, parameters: { action }, parent_job_id: job_id });
      queue.submit(job);
      return { content: [{ type: 'text', text: JSON.stringify({ job_id: id, status: 'pending' }) }] };
    }
  );

  // Tool: get_job_status
  mcp.tool(
    'get_job_status',
    'Check the current status of a job.',
    { job_id: z.string().describe('The job ID to check') },
    async ({ job_id }) => {
      const job = db.getJob(job_id);
      if (!job) return { content: [{ type: 'text', text: 'Error: job not found' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(job) }] };
    }
  );

  // Tool: list_jobs
  mcp.tool(
    'list_jobs',
    'List recent jobs, optionally filtered by status.',
    {
      status: z.enum(['pending', 'queued', 'in_progress', 'completed', 'failed']).optional().describe('Filter by status'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ status, limit }) => {
      const jobs = db.listJobs({ status, limit: limit || 20 });
      return { content: [{ type: 'text', text: JSON.stringify(jobs) }] };
    }
  );

  // Tool: wait_for_job
  mcp.tool(
    'wait_for_job',
    'Wait for a job to complete. Polls every 2s, returns when done or timed out.',
    {
      job_id: z.string().describe('The job ID to wait for'),
      timeout_seconds: z.number().min(1).max(600).optional().describe('Max wait time in seconds (default 120)'),
    },
    async ({ job_id, timeout_seconds }) => {
      const timeout = (timeout_seconds || 120) * 1000;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const job = db.getJob(job_id);
        if (!job) return { content: [{ type: 'text', text: 'Error: job not found' }], isError: true };
        if (job.status === 'completed' || job.status === 'failed') {
          return { content: [{ type: 'text', text: JSON.stringify(job) }] };
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      const job = db.getJob(job_id);
      return { content: [{ type: 'text', text: JSON.stringify({ ...job, _timeout: true }) }] };
    }
  );

  return mcp;
}

/**
 * Create Express app for MCP transport.
 */
export function createMcpApp(mcpServer, logger) {
  const app = express();

  // Map to track transports by session ID
  const transports = new Map();

  app.post('/mcp', async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      transports.set(transport.sessionId, transport);
      await mcpServer.connect(transport);

      transport.onclose = () => {
        transports.delete(transport.sessionId);
      };

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error({ err }, 'MCP request error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handleRequest(req, res);
    } else {
      res.status(400).json({ error: 'No active session' });
    }
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.close();
      transports.delete(sessionId);
      res.status(200).json({ message: 'Session closed' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  return app;
}
