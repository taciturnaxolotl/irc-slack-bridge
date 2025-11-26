import * as irc from "irc";
import { SlackAPIClient, SlackApp } from "slack-edge";
import { version } from "../package.json";
import { channelMappings, userMappings } from "./db";

const missingEnvVars = [];
if (!process.env.SLACK_BOT_TOKEN) missingEnvVars.push("SLACK_BOT_TOKEN");
if (!process.env.SLACK_SIGNING_SECRET)
  missingEnvVars.push("SLACK_SIGNING_SECRET");
if (!process.env.ADMINS) missingEnvVars.push("ADMINS");
if (!process.env.IRC_NICK) missingEnvVars.push("IRC_NICK");

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
}

const slackApp = new SlackApp({
  env: {
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN as string,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET as string,
    SLACK_LOGGING_LEVEL: "INFO",
  },
  startLazyListenerAfterAck: true,
});
const slackClient = slackApp.client;

// Get bot user ID
let botUserId: string | undefined;
slackClient.auth.test({
  token: process.env.SLACK_BOT_TOKEN,
}).then((result) => {
  botUserId = result.user_id;
  console.log(`Bot user ID: ${botUserId}`);
});

// IRC client setup
const ircClient = new irc.Client(
  "irc.hackclub.com",
  process.env.IRC_NICK || "slackbridge",
  {
    port: 6667,
    autoRejoin: true,
    autoConnect: true,
    channels: [],
    secure: false,
    userName: process.env.IRC_NICK,
    realName: "Slack IRC Bridge",
  },
);

// Join all mapped IRC channels on connect
ircClient.addListener("registered", async () => {
  console.log("Connected to IRC server");
  const mappings = channelMappings.getAll();
  for (const mapping of mappings) {
    ircClient.join(mapping.irc_channel);
  }
});

ircClient.addListener("join", (channel: string, nick: string) => {
  if (nick === process.env.IRC_NICK) {
    console.log(`Joined IRC channel: ${channel}`);
  }
});

ircClient.addListener(
  "message",
  async (nick: string, to: string, text: string) => {
    if (nick === process.env.IRC_NICK) return;
    if (nick === "****") return;

    // Find Slack channel mapping for this IRC channel
    const mapping = channelMappings.getByIrcChannel(to);
    if (!mapping) return;

    // Check if this IRC nick is mapped to a Slack user
    const userMapping = userMappings.getByIrcNick(nick);

    const displayName = `${nick} <irc>`;
    let iconUrl: string | undefined;

    if (userMapping) {
      try {
        iconUrl = `https://cachet.dunkirk.sh/users/${userMapping.slack_user_id}/r`;
      } catch (error) {
        console.error("Error fetching user info:", error);
      }
    }

    try {
      await slackClient.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: mapping.slack_channel_id,
        text: text,
        username: displayName,
        icon_url: iconUrl,
        unfurl_links: false,
        unfurl_media: false,
      });
    } catch (error) {
      console.error("Error posting to Slack:", error);
    }
  },
);

ircClient.addListener("error", (error: string) => {
  console.error("IRC error:", error);
});

// Slack event handlers
slackApp.event("message", async ({ payload }) => {
  if (payload.subtype) return;
  if (payload.bot_id) return;
  if (payload.user === botUserId) return;

  // Find IRC channel mapping for this Slack channel
  const mapping = channelMappings.getBySlackChannel(payload.channel);
  if (!mapping) {
    console.log(
      `No IRC channel mapping found for Slack channel ${payload.channel}`,
    );
    slackClient.conversations.leave({
      channel: payload.channel,
    });
    return;
  }

  try {
    const userInfo = await slackClient.users.info({
      token: process.env.SLACK_BOT_TOKEN,
      user: payload.user,
    });

    // Check for user mapping, otherwise use Slack name
    const userMapping = userMappings.getBySlackUser(payload.user);
    const username =
      userMapping?.irc_nick ||
      userInfo.user?.real_name ||
      userInfo.user?.name ||
      "Unknown";
    
    // Parse Slack mentions and replace with display names
    let messageText = payload.text;
    const mentionRegex = /<@(U[A-Z0-9]+)>/g;
    const mentions = Array.from(messageText.matchAll(mentionRegex));
    
    for (const match of mentions) {
      const userId = match[1];
      try {
        const response = await fetch(`https://cachet.dunkirk.sh/users/${userId}`);
        if (response.ok) {
          const data = await response.json();
          messageText = messageText.replace(match[0], `@${data.displayName}`);
        }
      } catch (error) {
        console.error(`Error fetching user ${userId} from cachet:`, error);
      }
    }
    
    const message = `<${username}> ${messageText}`;

    console.log(`Sending to IRC ${mapping.irc_channel}: ${message}`);
    ircClient.say(mapping.irc_channel, message);
  } catch (error) {
    console.error("Error handling Slack message:", error);
  }
});

export default {
  port: process.env.PORT || 3000,
  async fetch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case "/":
        return new Response(`Hello World from irc-slack-bridge@${version}`);
      case "/health":
        return new Response("OK");
      case "/slack":
        return slackApp.run(request);
      default:
        return new Response("404 Not Found", { status: 404 });
    }
  },
};

console.log(
  `🚀 Server Started in ${Bun.nanoseconds() / 1000000} milliseconds on version: ${version}!\n\n----------------------------------\n`,
);
console.log(
  `Connecting to IRC: irc.hackclub.com:6667 as ${process.env.IRC_NICK}`,
);
console.log(`Channel mappings: ${channelMappings.getAll().length}`);
console.log(`User mappings: ${userMappings.getAll().length}`);
