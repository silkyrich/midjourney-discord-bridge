import { ulid } from 'ulid';
import * as db from '../storage/database.js';
import * as commands from '../discord/commands.js';

/**
 * Worker processes jobs from the queue manager by dispatching Discord interactions.
 */
export class Worker {
  constructor(config, queue, logger) {
    this.config = config;
    this.queue = queue;
    this.logger = logger;
    this._running = false;
    this._interval = null;
  }

  start() {
    this._running = true;
    // Poll for pending jobs every 500ms
    this._interval = setInterval(() => this._tick(), 500);
    this.logger.info('Worker started');
  }

  stop() {
    this._running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  async _tick() {
    if (!this._running) return;

    const job = this.queue.dequeue();
    if (!job) return;

    try {
      await this._processJob(job);
    } catch (err) {
      this.logger.error({ err, jobId: job.id }, 'Failed to process job');
      db.updateJob(job.id, { status: 'failed', error: err.message });
      this.queue._finishJob(job.id);
      this.queue.emit('job:failed', { job: db.getJob(job.id) });
    }
  }

  async _processJob(job) {
    const { guild_id: guildId, channel_id: channelId } = this.config.discord;

    switch (job.type) {
      case 'imagine': {
        this.logger.info({ jobId: job.id, prompt: job.prompt }, 'Sending /imagine');
        const nonce = await commands.sendImagine(guildId, channelId, job.prompt);
        this.queue.registerNonce(nonce, job.id);
        break;
      }

      case 'upscale': {
        const parentJob = db.getJob(job.parent_job_id);
        if (!parentJob) throw new Error('Parent job not found');
        if (!parentJob.discord_message_id) throw new Error('Parent job has no discord message');

        const index = job.parameters?.index;
        if (!index) throw new Error('Upscale index not specified');

        // Get button custom_id from parent job result
        const buttons = parentJob.result?.buttons || {};
        const customId = buttons[`U${index}`];
        if (!customId) throw new Error(`Upscale button U${index} not found on parent job`);

        this.logger.info({ jobId: job.id, index, parentId: parentJob.id }, 'Clicking upscale button');
        const nonce = await commands.clickButton(guildId, channelId, parentJob.discord_message_id, customId);
        this.queue.registerNonce(nonce, job.id);
        this.queue.registerMessage(parentJob.discord_message_id, job.id);
        break;
      }

      case 'variation': {
        const parentJob = db.getJob(job.parent_job_id);
        if (!parentJob) throw new Error('Parent job not found');
        if (!parentJob.discord_message_id) throw new Error('Parent job has no discord message');

        const index = job.parameters?.index;
        if (!index) throw new Error('Variation index not specified');

        const buttons = parentJob.result?.buttons || {};
        const customId = buttons[`V${index}`];
        if (!customId) throw new Error(`Variation button V${index} not found on parent job`);

        this.logger.info({ jobId: job.id, index, parentId: parentJob.id }, 'Clicking variation button');
        const nonce = await commands.clickButton(guildId, channelId, parentJob.discord_message_id, customId);
        this.queue.registerNonce(nonce, job.id);
        break;
      }

      case 'describe': {
        const imageUrl = job.parameters?.image_url;
        if (!imageUrl) throw new Error('Image URL not specified for describe');

        this.logger.info({ jobId: job.id }, 'Sending /describe');
        const nonce = await commands.sendDescribe(guildId, channelId, imageUrl);
        this.queue.registerNonce(nonce, job.id);
        break;
      }

      case 'blend': {
        const imageUrls = job.parameters?.image_urls;
        if (!imageUrls || imageUrls.length < 2) throw new Error('Blend requires at least 2 image URLs');

        this.logger.info({ jobId: job.id, count: imageUrls.length }, 'Sending /blend');
        const nonce = await commands.sendBlend(guildId, channelId, imageUrls, job.parameters?.dimension);
        this.queue.registerNonce(nonce, job.id);
        break;
      }

      case 'shorten': {
        if (!job.prompt) throw new Error('Prompt not specified for shorten');

        this.logger.info({ jobId: job.id }, 'Sending /shorten');
        const nonce = await commands.sendShorten(guildId, channelId, job.prompt);
        this.queue.registerNonce(nonce, job.id);
        break;
      }

      case 'action': {
        const parentJob = db.getJob(job.parent_job_id);
        if (!parentJob) throw new Error('Parent job not found');
        if (!parentJob.discord_message_id) throw new Error('Parent job has no discord message');

        const action = job.parameters?.action;
        if (!action) throw new Error('Action not specified');

        const buttons = parentJob.result?.buttons || {};
        const customId = buttons[action];
        if (!customId) throw new Error(`Action button '${action}' not found on parent job`);

        this.logger.info({ jobId: job.id, action, parentId: parentJob.id }, 'Clicking action button');
        const nonce = await commands.clickButton(guildId, channelId, parentJob.discord_message_id, customId);
        this.queue.registerNonce(nonce, job.id);
        this.queue.registerMessage(parentJob.discord_message_id, job.id);
        break;
      }

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }
}

export function generateJobId() {
  return ulid();
}
