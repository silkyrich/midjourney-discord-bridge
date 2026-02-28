import { REST } from 'discord.js';

const MJ_BOT_ID = '936929561302675456';

// Hardcoded known MJ command data — IDs are stable snowflakes,
// versions change when MJ updates command definitions.
const KNOWN_COMMANDS = {
  imagine: {
    id: '938956540159881230',
    application_id: MJ_BOT_ID,
    version: '1237876415471554623',
    name: 'imagine',
    type: 1,
    options: [{ type: 3, name: 'prompt', description: 'The prompt to imagine', required: true }],
  },
  describe: {
    id: '1092492867185950852',
    application_id: MJ_BOT_ID,
    version: '1237876415471554625',
    name: 'describe',
    type: 1,
    options: [{ type: 11, name: 'image', description: 'The image to describe', required: true }],
  },
  blend: {
    id: '1062880104792997970',
    application_id: MJ_BOT_ID,
    version: '1237876415471554624',
    name: 'blend',
    type: 1,
  },
  shorten: {
    id: '1121575372539039774',
    application_id: MJ_BOT_ID,
    version: '1237876415471554626',
    name: 'shorten',
    type: 1,
  },
  info: {
    id: '972289487818334209',
    application_id: MJ_BOT_ID,
    version: '1237876415735660565',
    name: 'info',
    type: 1,
  },
  settings: {
    id: '1000850743479255081',
    application_id: MJ_BOT_ID,
    version: '1237876415790055475',
    name: 'settings',
    type: 1,
  },
};

let commandCache = { ...KNOWN_COMMANDS };
let rest;

export function initCommands(token) {
  rest = new REST({ version: '10' }).setToken(token);
}

/**
 * Discover Midjourney's slash command IDs.
 * Uses a Discord user token to fetch live command data (versions may change).
 * Falls back to hardcoded values if no user token is configured.
 */
export async function discoverCommands(guildId, channelId, userToken) {
  if (!userToken) {
    return commandCache; // use hardcoded defaults
  }

  // User token discovery — the only way to get fresh version IDs
  try {
    const resp = await fetch(`https://discord.com/api/v9/guilds/${guildId}/application-command-index`, {
      headers: { authorization: userToken },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const commands = data.application_commands || [];
    for (const cmd of commands) {
      if (cmd.application_id !== MJ_BOT_ID) continue;
      commandCache[cmd.name] = {
        id: cmd.id,
        application_id: cmd.application_id,
        version: cmd.version,
        name: cmd.name,
        type: cmd.type,
        options: cmd.options,
      };
    }
  } catch (err) {
    // Fall back to hardcoded — still functional, may break if MJ updates versions
    throw new Error(`Live discovery failed (using hardcoded): ${err.message}`);
  }

  return commandCache;
}

export function getCommandCache() {
  return commandCache;
}

/**
 * Send /imagine command to Midjourney bot.
 */
export async function sendImagine(guildId, channelId, prompt, sessionId) {
  const cmd = commandCache.imagine;
  if (!cmd) throw new Error('imagine command not available');

  const nonce = generateNonce();

  const payload = {
    type: 2, // APPLICATION_COMMAND
    application_id: MJ_BOT_ID,
    guild_id: guildId,
    channel_id: channelId,
    session_id: sessionId || generateSessionId(),
    data: {
      version: cmd.version,
      id: cmd.id,
      name: 'imagine',
      type: 1,
      options: [{ type: 3, name: 'prompt', value: prompt }],
      application_command: {
        id: cmd.id,
        application_id: MJ_BOT_ID,
        version: cmd.version,
        type: 1,
        name: 'imagine',
        description: 'Create images with Midjourney',
        options: cmd.options,
      },
      attachments: [],
    },
    nonce,
  };

  await rest.post('/interactions', { body: payload });
  return nonce;
}

/**
 * Send /describe command to Midjourney bot.
 */
export async function sendDescribe(guildId, channelId, imageUrl, sessionId) {
  const cmd = commandCache.describe;
  if (!cmd) throw new Error('describe command not available');

  const nonce = generateNonce();

  const payload = {
    type: 2,
    application_id: MJ_BOT_ID,
    guild_id: guildId,
    channel_id: channelId,
    session_id: sessionId || generateSessionId(),
    data: {
      version: cmd.version,
      id: cmd.id,
      name: 'describe',
      type: 1,
      options: [{ type: 11, name: 'image', value: imageUrl }],
      application_command: {
        id: cmd.id,
        application_id: MJ_BOT_ID,
        version: cmd.version,
        type: 1,
        name: 'describe',
        description: 'Describe an image',
        options: cmd.options,
      },
      attachments: [],
    },
    nonce,
  };

  await rest.post('/interactions', { body: payload });
  return nonce;
}

/**
 * Click a button (upscale/variation) on a Midjourney message.
 */
export async function clickButton(guildId, channelId, messageId, customId, sessionId) {
  const nonce = generateNonce();

  const payload = {
    type: 3, // MESSAGE_COMPONENT
    application_id: MJ_BOT_ID,
    guild_id: guildId,
    channel_id: channelId,
    message_id: messageId,
    session_id: sessionId || generateSessionId(),
    data: {
      component_type: 2, // Button
      custom_id: customId,
    },
    nonce,
  };

  await rest.post('/interactions', { body: payload });
  return nonce;
}

function generateNonce() {
  return String(BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000)));
}

function generateSessionId() {
  return [...Array(32)].map(() => Math.random().toString(16)[2]).join('');
}
