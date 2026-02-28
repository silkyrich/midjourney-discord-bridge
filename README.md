# Midjourney Discord Bridge

Self-hosted service that bridges Midjourney's Discord bot with a REST API and MCP server.

## Features

- **REST API** — Submit /imagine, /upscale, /variation, /describe jobs via HTTP
- **MCP Server** — 7 tools callable from Claude Code or any MCP client
- **Job Queue** — Concurrent job management with prompt-based correlation
- **Image Storage** — Auto-downloads to `~/Pictures/midjourney/` with meaningful filenames grouped by prompt
- **Webhooks** — POST notifications on job completion/failure with HMAC signing and retries
- **Auth** — API key protection via Bearer token or `x-api-key` header

## Quick Start

```bash
# Install dependencies
npm install

# Configure credentials
cp .env.example .env
# Edit .env with your values (see Configuration below)

# Start the service
npm start
```

## Configuration

### Required Environment Variables (`.env`)

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token ([Developer Portal](https://discord.com/developers/applications) → Bot → Token) |
| `DISCORD_GUILD_ID` | Server ID (right-click server → Copy Server ID) |
| `DISCORD_CHANNEL_ID` | Channel ID where Midjourney is active |
| `API_KEY` | Any string to protect your REST API |

### Optional

| Variable | Description |
|----------|-------------|
| `DISCORD_USER_TOKEN` | Discord user token for live command version refresh |
| `WEBHOOK_URL` | URL to receive job completion webhooks |
| `WEBHOOK_SECRET` | HMAC secret for webhook signatures |

### Discord Bot Setup

1. Create an application at [discord.com/developers/applications](https://discord.com/developers/applications)
2. Add a Bot, copy the token
3. Enable **Message Content Intent** under Bot → Privileged Gateway Intents
4. Invite the bot to your server with permissions: Read Messages, Message Content, Send Messages

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (no auth required) |
| `POST` | `/api/imagine` | Submit an /imagine job |
| `POST` | `/api/upscale` | Upscale a quadrant from a completed job |
| `POST` | `/api/variation` | Create a variation from a completed job |
| `POST` | `/api/describe` | Describe an image |
| `GET` | `/api/jobs/:id` | Get job status |
| `GET` | `/api/jobs` | List jobs (filterable by status/type) |
| `GET` | `/images/*` | Serve stored images (no auth required) |

### Example

```bash
# Generate an image
curl -X POST http://localhost:3000/api/imagine \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cyberpunk cityscape at sunset --ar 16:9"}'

# Check job status
curl http://localhost:3000/api/jobs/JOB_ID \
  -H "x-api-key: YOUR_KEY"
```

## MCP Tools

Connect to `http://localhost:3002/mcp` from any MCP client. Available tools:

- `generate_image` — Submit /imagine prompt
- `upscale_image` — Upscale a quadrant (1-4)
- `create_variation` — Create a variation (1-4)
- `describe_image` — Describe an image URL
- `get_job_status` — Check job status
- `list_jobs` — List recent jobs
- `wait_for_job` — Block until a job completes (polls every 2s)

## Image Storage

Images are saved to `~/Pictures/midjourney/` organized by prompt:

```
~/Pictures/midjourney/
  a-cool-spaceship-a1b2c3/
    prompt.md                          # Full prompt text
    a-cool-spaceship-a1b2c3_001.png
    a-cool-spaceship-a1b2c3_002.png    # Repeated prompts collect here
  sunset-over-tuscany-hills-d4e5f6/
    prompt.md
    sunset-over-tuscany-hills-d4e5f6_001.png
```

Folder names are clipped to 48 characters + a 6-char hash for uniqueness.

## Architecture

```
src/
  index.js              # Entry point, wires all components
  config.js             # YAML config with ${ENV_VAR} substitution
  api/                  # Fastify REST API
  discord/              # Discord client, MJ command sending, message monitoring
  queue/                # Job queue manager + worker
  mcp/                  # MCP server (StreamableHTTP transport)
  storage/              # SQLite database, image download, cleanup
  webhooks/             # Webhook dispatcher with retries
```

## License

MIT
