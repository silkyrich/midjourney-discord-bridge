const MJ_BOT_ID = '936929561302675456';
const DISCORD_API = 'https://discord.com/api/v9';

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
let userToken;

export function initCommands(token) {
  userToken = token;
}

/**
 * Send a raw interaction to Discord as the user.
 * All interactions must be sent with the user token so MJ treats them
 * as coming from a real user account.
 */
async function sendInteraction(payload) {
  if (!userToken) throw new Error('User token not configured — required to send MJ commands');

  const resp = await fetch(`${DISCORD_API}/interactions`, {
    method: 'POST',
    headers: {
      'authorization': userToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Discord interaction failed: ${resp.status} ${text}`);
  }
}

/**
 * Discover Midjourney's slash command IDs.
 * Uses the user token to fetch live command data (versions may change).
 * Falls back to hardcoded values if discovery fails.
 */
export async function discoverCommands(guildId, channelId) {
  if (!userToken) {
    return commandCache;
  }

  try {
    const resp = await fetch(`${DISCORD_API}/guilds/${guildId}/application-command-index`, {
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
    throw new Error(`Live discovery failed (using hardcoded): ${err.message}`);
  }

  return commandCache;
}

export function getCommandCache() {
  return commandCache;
}

/**
 * Send /imagine command as the user.
 */
export async function sendImagine(guildId, channelId, prompt, sessionId) {
  const cmd = commandCache.imagine;
  if (!cmd) throw new Error('imagine command not available');

  const nonce = generateNonce();

  await sendInteraction({
    type: 2,
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
  });

  return nonce;
}

/**
 * Send /describe command as the user.
 */
export async function sendDescribe(guildId, channelId, imageUrl, sessionId) {
  const cmd = commandCache.describe;
  if (!cmd) throw new Error('describe command not available');

  const nonce = generateNonce();

  await sendInteraction({
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
  });

  return nonce;
}

/**
 * Click a button (upscale/variation) on a Midjourney message, as the user.
 */
export async function clickButton(guildId, channelId, messageId, customId, sessionId) {
  const nonce = generateNonce();

  await sendInteraction({
    type: 3,
    application_id: MJ_BOT_ID,
    guild_id: guildId,
    channel_id: channelId,
    message_id: messageId,
    session_id: sessionId || generateSessionId(),
    data: {
      component_type: 2,
      custom_id: customId,
    },
    nonce,
  });

  return nonce;
}

function generateNonce() {
  return String(BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000)));
}

function generateSessionId() {
  return [...Array(32)].map(() => Math.random().toString(16)[2]).join('');
}
