import { mkdirSync, existsSync, createWriteStream, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const SLUG_MAX = 48;

/**
 * Slugify a prompt into a filesystem-safe name.
 * Clips to SLUG_MAX chars and appends a short hash for uniqueness.
 */
function slugifyPrompt(prompt) {
  if (!prompt) return 'unknown';

  const cleaned = prompt
    .replace(/\s+--\w+\s+\S+/g, '')
    .replace(/\s+--\w+/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!cleaned) return 'unknown';

  // Short hash of the full prompt for uniqueness
  const hash = createHash('sha256').update(prompt).digest('hex').slice(0, 6);
  const base = cleaned.slice(0, SLUG_MAX);

  return `${base}-${hash}`;
}

/**
 * Count existing images in a directory to determine the next sequence number.
 */
function nextSequence(dir) {
  if (!existsSync(dir)) return 1;
  const files = readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp|gif)$/i.test(f));
  return files.length + 1;
}

/**
 * Write/update a prompt.md file in the image folder with the full prompt text.
 */
function ensurePromptFile(dir, prompt) {
  if (!prompt) return;
  const mdPath = join(dir, 'prompt.md');

  // Only write if it doesn't exist yet (same folder = same prompt)
  if (!existsSync(mdPath)) {
    writeFileSync(mdPath, `# Prompt\n\n${prompt}\n`);
  }
}

/**
 * Download an image from Discord CDN and save with a meaningful name.
 *
 * Structure:
 *   images/<clipped-slug-hash>/
 *     prompt.md                    ← full prompt text
 *     <clipped-slug-hash>_001.png
 *     <clipped-slug-hash>_002.png  ← same prompt collects here
 *
 * Returns the relative path (for serving via /images/).
 */
export async function downloadImage(imageUrl, imageDir, jobId, prompt) {
  const slug = slugifyPrompt(prompt);
  const fullDir = resolve(imageDir, slug);

  if (!existsSync(fullDir)) mkdirSync(fullDir, { recursive: true });
  ensurePromptFile(fullDir, prompt);

  // Extract file extension from URL
  const urlPath = new URL(imageUrl).pathname;
  const ext = urlPath.match(/\.(\w+)$/)?.[1] || 'png';

  const seq = nextSequence(fullDir);
  const seqStr = String(seq).padStart(3, '0');
  const filename = `${slug}_${seqStr}.${ext}`;
  const filePath = join(fullDir, filename);

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);

  const body = Readable.fromWeb(response.body);
  await pipeline(body, createWriteStream(filePath));

  return `${slug}/${filename}`;
}
