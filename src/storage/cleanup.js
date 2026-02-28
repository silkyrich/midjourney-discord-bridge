import { readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deleteOldJobs } from './database.js';

/**
 * Clean up old images and database entries based on retention policy.
 */
export function startCleanup(config, logger) {
  const retentionDays = config.storage.retention_days;
  if (!retentionDays || retentionDays <= 0) return null;

  const imageDir = config.storage.image_dir;

  // Run cleanup daily
  const interval = setInterval(() => {
    runCleanup(imageDir, retentionDays, logger);
  }, 24 * 60 * 60 * 1000);

  // Also run once on startup (delayed)
  setTimeout(() => runCleanup(imageDir, retentionDays, logger), 60000);

  return interval;
}

function runCleanup(imageDir, retentionDays, logger) {
  try {
    // Clean old DB entries
    deleteOldJobs(retentionDays);
    logger.info({ retentionDays }, 'Cleaned old database entries');

    // Clean old image files
    if (!existsSync(imageDir)) return;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    removed += cleanDir(imageDir, cutoff);

    if (removed > 0) {
      logger.info({ removed }, 'Cleaned old image files');
    }
  } catch (err) {
    logger.error({ err }, 'Cleanup failed');
  }
}

function cleanDir(dir, cutoff) {
  let removed = 0;
  if (!existsSync(dir)) return removed;

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      removed += cleanDir(path, cutoff);
      // Remove empty directories
      try {
        const contents = readdirSync(path);
        if (contents.length === 0) rmSync(path);
      } catch {}
    } else if (stat.mtimeMs < cutoff) {
      rmSync(path);
      removed++;
    }
  }
  return removed;
}
