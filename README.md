# IRC <> Slack bridge

This is a little bot in active development to bridge slack and irc for Hackclub!

## How do I hack on it?

### Development

This is written in typescript so pretty easy to get started!

```bash
bun install
bun dev
```

### Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Choose "From an app manifest"
3. Copy the contents of `slack-manifest.yaml` and paste it
4. Install the app to your workspace
5. Copy the "Bot User OAuth Token" (starts with `xoxb-`) and "Signing Secret"
6. Invite the bot to your desired Slack channel: `/invite @IRC Bridge`

### Environment Setup

Make a `.env` file with the following:

```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here

# IRC Configuration
IRC_NICK=slackbridge

# Admin users (comma-separated Slack user IDs)
ADMINS=U1234567890

# Hack Club CDN Token (for file uploads)
CDN_TOKEN=your-cdn-token-here

# Server Configuration (optional)
PORT=3000
```

See `.env.example` for a template.

### Slash Commands

The bridge provides interactive slash commands for managing mappings:

- `/irc-bridge-channel` - Bridge current Slack channel to an IRC channel
- `/irc-unbridge-channel` - Remove bridge from current channel
- `/irc-bridge-user` - Link your Slack account to an IRC nickname
- `/irc-unbridge-user` - Remove your IRC nickname link
- `/irc-bridge-list` - List all channel and user bridges

### Managing Channel and User Mappings

Channel and user mappings are stored in a SQLite database (`bridge.db`). You can manage them through:

**Using Bun REPL:**
```bash
bun repl
> import { channelMappings, userMappings } from "./src/db"
> channelMappings.create("C1234567890", "#general")
> userMappings.create("U1234567890", "myircnick")
> channelMappings.getAll()
```

**Using SQLite directly:**
```bash
bun:sqlite bridge.db
sqlite> SELECT * FROM channel_mappings;
sqlite> INSERT INTO channel_mappings (slack_channel_id, irc_channel) VALUES ('C1234567890', '#general');
```

### How it works

The bridge connects to `irc.hackclub.com:6667` (no TLS) and forwards messages bidirectionally based on channel mappings:

- **IRC → Slack**: Messages from mapped IRC channels appear in their corresponding Slack channels
  - Image URLs are automatically displayed as inline attachments
  - IRC mentions (`@nick` or `nick:`) are converted to Slack mentions for mapped users
  - IRC formatting codes are converted to Slack markdown
- **Slack → IRC**: Messages from mapped Slack channels are sent to their corresponding IRC channels
  - Slack mentions are converted to `@displayName` format using Cachet
  - Slack markdown is converted to IRC formatting codes
  - File attachments are uploaded to Hack Club CDN and URLs are shared
- **User mappings** allow custom IRC nicknames for specific Slack users and enable proper mentions both ways

The bridge ignores its own messages and bot messages to prevent loops.

If you want to report an issue the main repo is [the tangled repo](https://tangled.org/dunkirk.sh/irc-slack-bridge) and the github is just a mirror.

<p align="center">
	<img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/master/.github/images/line-break.svg" />
</p>

<p align="center">
	&copy 2025-present <a href="https://github.com/taciturnaxolotl">Kieran Klukas</a>
</p>

<p align="center">
	<a href="https://github.com/taciturnaxolotl/irc-slack-bridge/blob/main/LICENSE.md"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>
