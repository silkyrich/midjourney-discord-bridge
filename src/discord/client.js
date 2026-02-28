import { Client, GatewayIntentBits } from 'discord.js';

export function createDiscordClient(config, logger) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('clientReady', () => {
    logger.info(`Discord bot logged in as ${client.user.tag}`);
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Discord client error');
  });

  return client;
}

export async function loginDiscord(client, token) {
  await client.login(token);
  return new Promise((resolve) => {
    if (client.isReady()) return resolve(client);
    client.once('clientReady', () => resolve(client));
  });
}
