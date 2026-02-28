import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db;
let dbPath;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('imagine', 'upscale', 'variation', 'describe')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'queued', 'in_progress', 'completed', 'failed')),
  prompt TEXT,
  parameters TEXT,
  parent_job_id TEXT,
  discord_message_id TEXT,
  discord_interaction_id TEXT,
  image_url TEXT,
  local_image_path TEXT,
  progress INTEGER DEFAULT 0,
  error TEXT,
  result TEXT,
  webhook_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_discord_message_id ON jobs(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id ON jobs(parent_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
`;

export async function initDatabase(path) {
  dbPath = path;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  if (existsSync(path)) {
    const buffer = readFileSync(path);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(SCHEMA);
  persist();
  return db;
}

function persist() {
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

export function createJob({ id, type, prompt, parameters, parent_job_id, webhook_url }) {
  db.run(
    `INSERT INTO jobs (id, type, prompt, parameters, parent_job_id, webhook_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, type, prompt || null, parameters ? JSON.stringify(parameters) : null, parent_job_id || null, webhook_url || null]
  );
  persist();
  return getJob(id);
}

export function getJob(id) {
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return deserializeJob(row);
  }
  stmt.free();
  return null;
}

export function updateJob(id, updates) {
  const allowed = [
    'status', 'prompt', 'discord_message_id', 'discord_interaction_id',
    'image_url', 'local_image_path', 'progress', 'error', 'result', 'webhook_url'
  ];
  const sets = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = ?`);
    if (key === 'result' || key === 'parameters') {
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    } else {
      values.push(value ?? null);
    }
  }

  if (sets.length === 0) return getJob(id);

  sets.push("updated_at = datetime('now')");

  if (updates.status === 'completed' || updates.status === 'failed') {
    sets.push("completed_at = datetime('now')");
  }

  values.push(id);
  db.run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, values);
  persist();
  return getJob(id);
}

export function listJobs({ status, type, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const values = [];

  if (status) {
    conditions.push('status = ?');
    values.push(status);
  }
  if (type) {
    conditions.push('type = ?');
    values.push(type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);

  const stmt = db.prepare(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  );
  stmt.bind(values);

  const jobs = [];
  while (stmt.step()) {
    jobs.push(deserializeJob(stmt.getAsObject()));
  }
  stmt.free();
  return jobs;
}

export function getJobsByDiscordMessageId(messageId) {
  const stmt = db.prepare('SELECT * FROM jobs WHERE discord_message_id = ?');
  stmt.bind([messageId]);
  const jobs = [];
  while (stmt.step()) {
    jobs.push(deserializeJob(stmt.getAsObject()));
  }
  stmt.free();
  return jobs;
}

export function deleteOldJobs(days) {
  db.run(
    `DELETE FROM jobs WHERE created_at < datetime('now', '-' || ? || ' days')`,
    [days]
  );
  persist();
}

export function getDatabase() {
  return db;
}

function deserializeJob(row) {
  return {
    ...row,
    parameters: row.parameters ? JSON.parse(row.parameters) : null,
    result: row.result ? JSON.parse(row.result) : null,
  };
}
