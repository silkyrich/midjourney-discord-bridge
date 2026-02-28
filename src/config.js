import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

// Load .env file into process.env
function loadDotenv(path = '.env') {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotenv();

const ENV_VAR_RE = /\$\{(\w+)\}/g;

function substituteEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(ENV_VAR_RE, (_, name) => process.env[name] || '');
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(path = 'config.yaml') {
  const raw = readFileSync(path, 'utf8');
  const parsed = parse(raw);
  return substituteEnvVars(parsed);
}

let _config;

export function getConfig() {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
