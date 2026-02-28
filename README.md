# Midjourney Discord Bridge

Self-hosted service that bridges Midjourney's Discord bot with a REST API and MCP server.

> **USE AT YOUR OWN RISK.** This project sends Discord interactions using your personal user token, which is against Discord's Terms of Service. Your account may be suspended or banned. The authors are not responsible for any consequences including account termination, lost subscriptions, or other damages. By using this software you accept all associated risks.

## Features

- **REST API** — Submit /imagine, /upscale, /variation, /describe, /blend, /shorten, and action button jobs via HTTP
- **MCP Server** — 10 tools callable from Claude Code or any MCP client
- **Job Queue** — Concurrent job management with prompt-based correlation
- **Image Storage** — Auto-downloads to `~/Pictures/midjourney/` with meaningful filenames grouped by prompt
- **Action Buttons** — Vary (strong/subtle/region), zoom out, pan, upscale (subtle/creative/2x/4x), reroll
- **Webhooks** — POST notifications on job completion/failure with HMAC signing and retries
- **Auth** — API key protection via Bearer token or `x-api-key` header

## Setup Guide

### Prerequisites

- Node.js 18+
- A Discord account with an active Midjourney subscription
- A Discord server (guild) where Midjourney bot is available

### Step 1: Create a Discord Bot (for monitoring)

The bot token is used to **monitor** Midjourney's responses in the channel. It does not send commands.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to **Bot** in the left sidebar
4. Click **Reset Token** and copy the token — this is your `DISCORD_TOKEN`
5. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent** (required to read MJ responses)
6. Go to **OAuth2 → URL Generator**
   - Scopes: `bot`
   - Bot Permissions: `Read Messages/View Channels`, `Read Message History`
7. Copy the generated URL, open it in your browser, and invite the bot to your server

### Step 2: Get Your Discord User Token

The user token is used to **send** /imagine and other commands as your account. This is what Midjourney sees and responds to.

1. Open Discord in a web browser (not the desktop app)
2. Open Developer Tools (F12) → Network tab
3. Send any message in a channel
4. Find the request to `discord.com/api` in the Network tab
5. Look for the `authorization` header in the request headers — this is your `DISCORD_USER_TOKEN`

**Keep this token secret.** Anyone with it can act as your Discord account.

### Step 3: Get Server and Channel IDs

1. In Discord, go to **Settings → Advanced → Developer Mode** (enable it)
2. Right-click your server name → **Copy Server ID** — this is your `DISCORD_GUILD_ID`
3. Right-click the channel where you want MJ to operate → **Copy Channel ID** — this is your `DISCORD_CHANNEL_ID`

The bot must be invited to this server, and Midjourney must be accessible in this channel.

### Step 4: Configure and Run

```bash
# Clone and install
git clone https://github.com/silkyrich/midjourney-discord-bridge.git
cd midjourney-discord-bridge
npm install

# Configure
cp .env.example .env
# Edit .env with your values from steps 1-3
```

**`.env` file:**

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=your_server_id
DISCORD_CHANNEL_ID=your_channel_id
DISCORD_USER_TOKEN=your_user_token_here
API_KEY=any-secret-string-for-api-auth
# WEBHOOK_URL=https://your-server.com/webhook  (optional)
# WEBHOOK_SECRET=hmac-secret                    (optional)
```

```bash
# Start
npm start
```

The service starts three servers:
- **REST API** on port `3000`
- **MCP server** on port `3002`
- **Discord bot** (gateway connection for monitoring)

### Step 5: Test It

```bash
# Health check
curl http://localhost:3000/api/health

# Generate an image
curl -X POST http://localhost:3000/api/imagine \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cyberpunk cityscape at sunset --ar 16:9"}'

# Check job status (use the job_id from the response above)
curl http://localhost:3000/api/jobs/JOB_ID \
  -H "x-api-key: YOUR_API_KEY"
```

## API Reference

All endpoints except `/api/health` and `/images/*` require authentication via `Authorization: Bearer YOUR_KEY` or `x-api-key: YOUR_KEY` header.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | Health check with Discord status and queue depth |

### Image Generation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/imagine` | Yes | Submit an /imagine prompt |
| `POST` | `/api/blend` | Yes | Blend 2-5 images together |
| `POST` | `/api/describe` | Yes | Get text descriptions of an image |
| `POST` | `/api/shorten` | Yes | Analyze/shorten a prompt |

### Post-Generation Actions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/upscale` | Yes | Upscale a quadrant (1-4) from a completed imagine job |
| `POST` | `/api/variation` | Yes | Create a variation of a quadrant (1-4) |
| `POST` | `/api/action` | Yes | Perform any available action button on a completed job |

### Job Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/jobs/:id` | Yes | Get job status, progress, and results |
| `GET` | `/api/jobs` | Yes | List jobs (filterable by `?status=` and `?type=`) |

### Image Serving

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/images/*` | No | Serve stored images (permanent URLs) |

---

### POST /api/imagine

```json
{ "prompt": "a cat in space --ar 16:9 --v 6.0", "webhook_url": "https://..." }
```

**Parameters:** Midjourney parameters are passed inline in the prompt string: `--ar`, `--v`, `--style`, `--chaos`, `--seed`, `--no`, `--q`, `--s`, `--tile`, `--weird`, etc.

### POST /api/upscale

```json
{ "job_id": "01HXYZ...", "index": 1 }
```

`index`: 1-4 (quadrant of the image grid)

### POST /api/variation

```json
{ "job_id": "01HXYZ...", "index": 2 }
```

### POST /api/describe

```json
{ "image_url": "https://example.com/photo.jpg" }
```

### POST /api/blend

```json
{
  "image_urls": ["https://img1.jpg", "https://img2.jpg", "https://img3.jpg"],
  "dimension": "landscape"
}
```

`image_urls`: 2-5 image URLs. `dimension`: optional, one of `portrait`, `square`, `landscape`.

### POST /api/shorten

```json
{ "prompt": "a very long and detailed prompt with many descriptors..." }
```

### POST /api/action

Perform any available button action on a completed job. This is the generic endpoint for all post-generation actions.

```json
{ "job_id": "01HXYZ...", "action": "vary_strong" }
```

**Available actions** (depends on the job type and MJ version):

| Action | Description |
|--------|-------------|
| `reroll` | Re-run the same prompt |
| `vary_strong` | Strong variation of an upscaled image |
| `vary_subtle` | Subtle variation of an upscaled image |
| `vary_region` | Vary a specific region (inpainting) |
| `upscale_subtle` | Subtle upscale |
| `upscale_creative` | Creative upscale |
| `upscale_2x` | 2x upscale |
| `upscale_4x` | 4x upscale |
| `zoom_out_2x` | Zoom out 2x |
| `zoom_out_1_5x` | Zoom out 1.5x |
| `custom_zoom` | Custom zoom with prompt |
| `pan_left` | Pan left |
| `pan_right` | Pan right |
| `pan_up` | Pan up |
| `pan_down` | Pan down |
| `make_square` | Make the image square |

Not all actions are available on every job. The API returns `available_actions` when an action is not found.

### GET /api/jobs/:id

Response:

```json
{
  "id": "01HXYZ...",
  "type": "imagine",
  "status": "completed",
  "prompt": "a cat in space",
  "progress": 100,
  "image_url": "https://cdn.discordapp.com/...",
  "local_image_path": "a-cat-in-space-abc123/a-cat-in-space-abc123_001.png",
  "result": {
    "buttons": { "U1": "...", "U2": "...", "V1": "...", "reroll": "..." },
    "image_url": "..."
  },
  "created_at": "2024-01-01T00:00:00Z",
  "completed_at": "2024-01-01T00:01:30Z"
}
```

## MCP Tools

Connect to `http://localhost:3002/mcp` from any MCP client. Available tools:

| Tool | Description |
|------|-------------|
| `generate_image` | Submit /imagine prompt |
| `upscale_image` | Upscale a quadrant (1-4) |
| `create_variation` | Create a variation (1-4) |
| `describe_image` | Describe an image URL |
| `blend_images` | Blend 2-5 images together |
| `shorten_prompt` | Analyze/shorten a prompt |
| `perform_action` | Any action button (vary, zoom, pan, upscale, reroll) |
| `get_job_status` | Check job status |
| `list_jobs` | List recent jobs |
| `wait_for_job` | Block until a job completes (polls every 2s) |

### Claude Code Configuration

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "midjourney": {
      "type": "url",
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

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

Folder names are clipped to 48 characters + a 6-char hash for uniqueness. The `prompt.md` file contains the full unclipped prompt text.

## Architecture

```
src/
  index.js              # Entry point, wires all components
  config.js             # YAML config with ${ENV_VAR} substitution
  api/                  # Fastify REST API
    routes/             # imagine, upscale, variation, describe, blend, shorten, action, jobs, health
    middleware/          # API key auth
  discord/              # Discord client, MJ command sending, message monitoring
    client.js           # discord.js client (bot token, monitoring only)
    commands.js         # Raw interaction sending (user token)
    monitor.js          # Message parsing and job correlation
    interactions.js     # Button custom_id extraction
  queue/                # Job queue manager + worker
  mcp/                  # MCP server (StreamableHTTP transport)
  storage/              # SQLite database, image download, cleanup
  webhooks/             # Webhook dispatcher with retries
```

### How It Works

1. You send a request to the REST API (or use an MCP tool)
2. The service sends a Discord interaction **as your user account** (via user token)
3. Midjourney processes the request and posts its response in the channel
4. The Discord bot **monitors** the channel for MJ responses
5. The job queue correlates the response to your original request
6. Images are downloaded and stored locally
7. Webhooks fire (if configured) and the job status updates

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Used disallowed intents` | Enable **Message Content Intent** in Discord Developer Portal → Bot → Privileged Gateway Intents |
| `TokenInvalid` | Check that your bot token in `.env` is correct and not expired |
| Commands sent but no response | Ensure Midjourney can see the channel, and your user token is valid |
| `EADDRINUSE` | Another process is using port 3000 or 3002. Change ports in `config.yaml` |
| Command discovery failed | Normal if no user token set. Hardcoded command IDs are used as fallback |
| Bot not receiving messages | Make sure the bot is invited to the server and has Read Messages permission |

## License

MIT
