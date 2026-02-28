import { EventEmitter } from 'node:events';

const MJ_BOT_ID = '936929561302675456';

/**
 * Monitors Discord messages from Midjourney bot and emits correlation events.
 *
 * Events:
 *   'job:progress' - { prompt, progress, messageId, message }
 *   'job:complete' - { prompt, messageId, imageUrl, message, components }
 *   'job:error'    - { prompt, messageId, error, message }
 *   'job:describe' - { messageId, descriptions, message }
 */
export class MessageMonitor extends EventEmitter {
  constructor(client, config, logger) {
    super();
    this.client = client;
    this.channelId = config.discord.channel_id;
    this.logger = logger;
    this._bound = false;
  }

  start() {
    if (this._bound) return;
    this._bound = true;

    this.client.on('messageCreate', (msg) => this._handleMessage(msg));
    this.client.on('messageUpdate', (_, msg) => {
      if (msg.partial) return;
      this._handleMessage(msg);
    });

    this.logger.info('Message monitor started');
  }

  _handleMessage(msg) {
    // Only process messages from MJ bot in our channel
    if (msg.author?.id !== MJ_BOT_ID) return;
    if (msg.channelId !== this.channelId) return;

    const content = msg.content || '';
    const messageId = msg.id;

    // Check for error messages
    if (this._isError(content)) {
      const prompt = this._extractPrompt(content);
      this.emit('job:error', {
        prompt,
        messageId,
        error: content,
        message: msg,
      });
      return;
    }

    // Check for describe results (embeds)
    if (msg.embeds?.length > 0 && this._isDescribeResult(msg)) {
      const descriptions = this._extractDescriptions(msg);
      this.emit('job:describe', {
        messageId,
        descriptions,
        message: msg,
      });
      return;
    }

    // Check for progress (e.g., "(42%)")
    const progress = this._extractProgress(content);
    const prompt = this._extractPrompt(content);

    if (progress !== null && progress < 100) {
      this.emit('job:progress', {
        prompt,
        progress,
        messageId,
        message: msg,
      });
      return;
    }

    // Check for completed image (has attachments or embedded images)
    const imageUrl = this._extractImageUrl(msg);
    if (imageUrl && prompt) {
      this.emit('job:complete', {
        prompt,
        messageId,
        imageUrl,
        message: msg,
        components: msg.components || [],
      });
    }
  }

  _isError(content) {
    const errorPatterns = [
      /banned/i,
      /blocked/i,
      /invalid/i,
      /error/i,
      /failed/i,
      /not allowed/i,
      /queue full/i,
    ];
    // Only flag as error if it looks like an error message (not a normal generation)
    return errorPatterns.some(p => p.test(content)) && !content.includes('**');
  }

  _isDescribeResult(msg) {
    return msg.embeds.some(e => e.description?.includes('1️⃣') || e.title?.toLowerCase().includes('describe'));
  }

  _extractDescriptions(msg) {
    const descriptions = [];
    for (const embed of msg.embeds) {
      const desc = embed.description || '';
      const lines = desc.split('\n').filter(l => /^\d️⃣/.test(l.trim()) || /^\*\*\d/.test(l.trim()));
      for (const line of lines) {
        descriptions.push(line.replace(/^\d️⃣\s*/, '').replace(/^\*\*\d\.\*\*\s*/, '').trim());
      }
    }
    return descriptions;
  }

  /**
   * Extract prompt text from between ** markers.
   * MJ format: "**prompt text** - <@user> (fast)" or "**prompt text** - Variations ..."
   */
  _extractPrompt(content) {
    const match = content.match(/\*\*(.+?)\*\*/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract progress percentage from content.
   * MJ format: "**prompt** - (42%) <progress bar>"
   */
  _extractProgress(content) {
    const match = content.match(/\((\d+)%\)/);
    return match ? parseInt(match[1], 10) : null;
  }

  _extractImageUrl(msg) {
    // Attachments first
    if (msg.attachments?.size > 0) {
      const img = msg.attachments.find(a => a.contentType?.startsWith('image/'));
      if (img) return img.url;
    }
    // Embeds
    if (msg.embeds?.length > 0) {
      for (const embed of msg.embeds) {
        if (embed.image?.url) return embed.image.url;
      }
    }
    return null;
  }
}

/**
 * Normalize a prompt for correlation matching.
 * Strips trailing parameters (--ar, --v, etc.) and lowercases.
 */
export function normalizePrompt(prompt) {
  if (!prompt) return '';
  return prompt
    .replace(/\s+--\w+\s+\S+/g, '') // remove --param value pairs
    .replace(/\s+--\w+/g, '')        // remove --flags
    .toLowerCase()
    .trim();
}
