import { EventEmitter } from 'node:events';
import { normalizePrompt } from '../discord/monitor.js';
import { extractButtons } from '../discord/interactions.js';
import * as db from '../storage/database.js';

/**
 * Job Queue Manager — coordinates job lifecycle, concurrency, and correlation.
 *
 * Events:
 *   'job:updated'   - { job }
 *   'job:completed'  - { job }
 *   'job:failed'     - { job }
 */
export class QueueManager extends EventEmitter {
  constructor(config, logger) {
    super();
    this.maxConcurrent = config.queue.max_concurrent;
    this.jobTimeoutMs = config.queue.job_timeout_ms;
    this.correlationWindowMs = config.queue.correlation_window_ms;
    this.logger = logger;

    // Correlation maps
    // prompt -> Job[] (FIFO) for imagine jobs
    this.promptMap = new Map();
    // discord_message_id -> job_id for upscale/variation correlation
    this.messageMap = new Map();
    // nonce -> job_id for direct nonce correlation
    this.nonceMap = new Map();

    // Active job tracking
    this.activeJobs = new Set();
    this.pendingQueue = [];

    // Timeout handles
    this._timeouts = new Map();
  }

  activeCount() {
    return this.activeJobs.size;
  }

  pendingCount() {
    return this.pendingQueue.length;
  }

  /**
   * Submit a new job into the queue.
   */
  submit(job) {
    this.pendingQueue.push(job.id);

    // Register in correlation maps
    if (job.type === 'imagine' && job.prompt) {
      const key = normalizePrompt(job.prompt);
      if (!this.promptMap.has(key)) this.promptMap.set(key, []);
      this.promptMap.get(key).push(job.id);
    }

    this.logger.info({ jobId: job.id, type: job.type }, 'Job submitted');
    return job;
  }

  /**
   * Try to process the next pending job. Returns the job if one was started.
   */
  dequeue() {
    if (this.activeJobs.size >= this.maxConcurrent) return null;
    const jobId = this.pendingQueue.shift();
    if (!jobId) return null;

    this.activeJobs.add(jobId);
    const job = db.updateJob(jobId, { status: 'in_progress' });

    // Set timeout
    const handle = setTimeout(() => {
      this._handleTimeout(jobId);
    }, this.jobTimeoutMs);
    this._timeouts.set(jobId, handle);

    this.emit('job:updated', { job });
    return job;
  }

  /**
   * Register a nonce for correlation with a job.
   */
  registerNonce(nonce, jobId) {
    this.nonceMap.set(nonce, jobId);
  }

  /**
   * Register a message ID mapping to a job.
   */
  registerMessage(messageId, jobId) {
    this.messageMap.set(messageId, jobId);
    db.updateJob(jobId, { discord_message_id: messageId });
  }

  /**
   * Handle progress update from monitor.
   */
  handleProgress({ prompt, progress, messageId }) {
    const jobId = this._findJobByPrompt(prompt) || this.messageMap.get(messageId);
    if (!jobId) return;

    // Register message mapping if not already known
    if (messageId && !this.messageMap.has(messageId)) {
      this.registerMessage(messageId, jobId);
    }

    const job = db.updateJob(jobId, { progress });
    this.emit('job:updated', { job });
  }

  /**
   * Handle completion from monitor.
   */
  handleComplete({ prompt, messageId, imageUrl, components }) {
    const jobId = this._findJobByPrompt(prompt) || this.messageMap.get(messageId);
    if (!jobId) {
      this.logger.warn({ prompt, messageId }, 'Completed message with no matching job');
      return;
    }

    // Store button custom_ids for future upscale/variation
    const buttons = extractButtons(components);

    const job = db.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      image_url: imageUrl,
      discord_message_id: messageId,
      result: { buttons, image_url: imageUrl },
    });

    this._finishJob(jobId);
    this.emit('job:completed', { job });
  }

  /**
   * Handle error from monitor.
   */
  handleError({ prompt, messageId, error }) {
    const jobId = this._findJobByPrompt(prompt) || this.messageMap.get(messageId);
    if (!jobId) return;

    const job = db.updateJob(jobId, {
      status: 'failed',
      error: typeof error === 'string' ? error : JSON.stringify(error),
    });

    this._finishJob(jobId);
    this.emit('job:failed', { job });
  }

  /**
   * Handle describe result from monitor.
   */
  handleDescribe({ messageId, descriptions }) {
    // Find a pending describe job (most recent)
    const pendingDescribe = db.listJobs({ type: 'describe', status: 'in_progress', limit: 1 });
    if (pendingDescribe.length === 0) return;

    const jobId = pendingDescribe[0].id;
    const job = db.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      discord_message_id: messageId,
      result: { descriptions },
    });

    this._finishJob(jobId);
    this.emit('job:completed', { job });
  }

  /**
   * Handle shorten result from monitor.
   */
  handleShorten({ messageId, shortened }) {
    const pendingShorten = db.listJobs({ type: 'shorten', status: 'in_progress', limit: 1 });
    if (pendingShorten.length === 0) return;

    const jobId = pendingShorten[0].id;
    const job = db.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      discord_message_id: messageId,
      result: shortened,
    });

    this._finishJob(jobId);
    this.emit('job:completed', { job });
  }

  /**
   * Handle upscale/variation completion — correlated by parent discord message.
   */
  handleUpscaleVariationComplete({ messageId, imageUrl, parentMessageId }) {
    const jobId = this.messageMap.get(parentMessageId) || this.messageMap.get(messageId);
    if (!jobId) return;

    const job = db.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      image_url: imageUrl,
      discord_message_id: messageId,
    });

    this._finishJob(jobId);
    this.emit('job:completed', { job });
  }

  /**
   * Find a job ID by normalized prompt (FIFO).
   */
  _findJobByPrompt(prompt) {
    if (!prompt) return null;
    const key = normalizePrompt(prompt);
    const queue = this.promptMap.get(key);
    if (!queue || queue.length === 0) return null;

    // Check if the first job is still active/in_progress
    const jobId = queue[0];
    const job = db.getJob(jobId);
    if (!job) {
      queue.shift();
      return this._findJobByPrompt(prompt);
    }

    // Check if within correlation window
    const age = Date.now() - new Date(job.created_at).getTime();
    if (age > this.correlationWindowMs) {
      queue.shift();
      return this._findJobByPrompt(prompt);
    }

    return jobId;
  }

  _finishJob(jobId) {
    this.activeJobs.delete(jobId);

    // Clear timeout
    const handle = this._timeouts.get(jobId);
    if (handle) {
      clearTimeout(handle);
      this._timeouts.delete(jobId);
    }

    // Remove from prompt map
    for (const [key, queue] of this.promptMap) {
      const idx = queue.indexOf(jobId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        if (queue.length === 0) this.promptMap.delete(key);
        break;
      }
    }
  }

  _handleTimeout(jobId) {
    const job = db.getJob(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    this.logger.warn({ jobId }, 'Job timed out');
    const updated = db.updateJob(jobId, { status: 'failed', error: 'Job timed out' });
    this._finishJob(jobId);
    this.emit('job:failed', { job: updated });
  }

  shutdown() {
    for (const handle of this._timeouts.values()) {
      clearTimeout(handle);
    }
    this._timeouts.clear();
  }
}
