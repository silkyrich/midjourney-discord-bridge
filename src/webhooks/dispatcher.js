import { createHmac } from 'node:crypto';

export class WebhookDispatcher {
  constructor(config, logger) {
    this.defaultUrl = config.webhooks.url;
    this.secret = config.webhooks.secret;
    this.retryAttempts = config.webhooks.retry_attempts || 3;
    this.retryDelayMs = config.webhooks.retry_delay_ms || 1000;
    this.logger = logger;
  }

  /**
   * Fire a webhook for a completed/failed job.
   */
  async dispatch(job) {
    const url = job.webhook_url || this.defaultUrl;
    if (!url) return;

    const payload = {
      event: job.status === 'completed' ? 'job.completed' : 'job.failed',
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        prompt: job.prompt,
        image_url: job.image_url,
        local_image_path: job.local_image_path,
        error: job.error,
        result: job.result,
        created_at: job.created_at,
        completed_at: job.completed_at,
      },
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'midjourney-discord-bridge/1.0',
    };

    if (this.secret) {
      headers['X-Webhook-Signature'] = createHmac('sha256', this.secret).update(body).digest('hex');
    }

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, { method: 'POST', headers, body });

        if (response.ok) {
          this.logger.info({ jobId: job.id, url, attempt }, 'Webhook delivered');
          return;
        }

        this.logger.warn({ jobId: job.id, url, status: response.status, attempt }, 'Webhook failed');
      } catch (err) {
        this.logger.warn({ jobId: job.id, url, err: err.message, attempt }, 'Webhook error');
      }

      if (attempt < this.retryAttempts) {
        // Exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    this.logger.error({ jobId: job.id, url }, 'Webhook exhausted all retries');
  }
}
