import * as irc from "irc";
import { SlackApp } from "slack-edge";
import { version } from "../package.json";
import { registerCommands } from "./commands";
import { channelMappings, userMappings } from "./lib/db";
import { getAvatarForNick } from "./lib/avatars";
import { uploadToCDN } from "./lib/cdn";
import {
	convertIrcMentionsToSlack,
	convertSlackMentionsToIrc,
} from "./lib/mentions";
import { parseIRCFormatting, parseSlackMarkdown } from "./lib/parser";

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
slackClient.auth
	.test({
		token: process.env.SLACK_BOT_TOKEN,
	})
	.then((result) => {
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

// Clean up IRC connection on hot reload or exit
process.on("beforeExit", () => {
	ircClient.disconnect("Reloading", () => {
		console.log("IRC client disconnected");
	});
});

// Register slash commands
registerCommands();

// Track NickServ authentication state
let nickServAuthAttempted = false;
let isAuthenticated = false;

// Join all mapped IRC channels on connect
ircClient.addListener("registered", async () => {
	console.log("Connected to IRC server");

	// Authenticate with NickServ if password is provided
	if (process.env.NICKSERV_PASSWORD && !nickServAuthAttempted) {
		nickServAuthAttempted = true;
		console.log("Authenticating with NickServ...");
		ircClient.say("NickServ", `IDENTIFY ${process.env.NICKSERV_PASSWORD}`);
		// Don't join channels yet - wait for NickServ response
	} else if (!process.env.NICKSERV_PASSWORD) {
		// No auth needed, join immediately
		const mappings = channelMappings.getAll();
		for (const mapping of mappings) {
			ircClient.join(mapping.irc_channel);
		}
	}
});

ircClient.addListener("join", (channel: string, nick: string) => {
	if (nick === process.env.IRC_NICK) {
		console.log(`Joined IRC channel: ${channel}`);
	}
});

// Handle NickServ notices
ircClient.addListener(
	"notice",
	async (nick: string, to: string, text: string) => {
		if (nick !== "NickServ") return;

		console.log(`NickServ: ${text}`);

		// Check for successful authentication
		if (
			text.includes("You are now identified") ||
			text.includes("Password accepted")
		) {
			console.log("✓ Successfully authenticated with NickServ");
			isAuthenticated = true;

			// Join channels after successful auth
			const mappings = channelMappings.getAll();
			for (const mapping of mappings) {
				ircClient.join(mapping.irc_channel);
			}
		}
		// Check if nick is not registered
		else if (
			text.includes("isn't registered") ||
			text.includes("not registered")
		) {
			console.log("Nick not registered, registering with NickServ...");
			if (process.env.NICKSERV_PASSWORD && process.env.NICKSERV_EMAIL) {
				ircClient.say(
					"NickServ",
					`REGISTER ${process.env.NICKSERV_PASSWORD} ${process.env.NICKSERV_EMAIL}`,
				);
			} else {
				console.error("Cannot register: NICKSERV_EMAIL not configured");
			}
		}
		// Check for failed authentication
		else if (
			text.includes("Invalid password") ||
			text.includes("Access denied")
		) {
			console.error("✗ NickServ authentication failed: Invalid password");
		}
	},
);

ircClient.addListener(
	"message",
	async (nick: string, to: string, text: string) => {
		// Ignore messages from our own bot (with or without numbers suffix)
		const botNickPattern = new RegExp(`^${process.env.IRC_NICK}\\d*$`);
		if (botNickPattern.test(nick)) return;
		if (nick === "****") return;

		// Find Slack channel mapping for this IRC channel
		const mapping = channelMappings.getByIrcChannel(to);
		if (!mapping) return;

		// Check if this IRC nick is mapped to a Slack user
		const userMapping = userMappings.getByIrcNick(nick);

		const displayName = `${nick} <irc>`;
		let iconUrl: string;

		if (userMapping) {
			iconUrl = `https://cachet.dunkirk.sh/users/${userMapping.slack_user_id}/r`;
		} else {
			// Use stable random avatar for unmapped users
			iconUrl = getAvatarForNick(nick);
		}

		// Parse IRC mentions and convert to Slack mentions
		let messageText = parseIRCFormatting(text);

		// Extract image URLs from the message
		const imagePattern =
			/https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg)(?:\?[^\s]*)?/gi;
		const imageUrls = Array.from(messageText.matchAll(imagePattern));

		messageText = convertIrcMentionsToSlack(messageText);

		try {
			// If there are image URLs, send them as attachments
			if (imageUrls.length > 0) {
				const attachments = imageUrls.map((match) => ({
					image_url: match[0],
					fallback: match[0],
				}));

				await slackClient.chat.postMessage({
					token: process.env.SLACK_BOT_TOKEN,
					channel: mapping.slack_channel_id,
					text: messageText,
					username: displayName,
					icon_url: iconUrl,
					attachments: attachments,
					unfurl_links: false,
					unfurl_media: false,
				});
			} else {
				await slackClient.chat.postMessage({
					token: process.env.SLACK_BOT_TOKEN,
					channel: mapping.slack_channel_id,
					text: messageText,
					username: displayName,
					icon_url: iconUrl,
					unfurl_links: true,
					unfurl_media: true,
				});
			}
			console.log(`IRC (${to}) → Slack: <${nick}> ${text}`);
		} catch (error) {
			console.error("Error posting to Slack:", error);
		}
	},
);

ircClient.addListener("error", (error: string) => {
	console.error("IRC error:", error);
});

// Handle IRC /me actions
ircClient.addListener(
	"action",
	async (nick: string, to: string, text: string) => {
		// Ignore messages from our own bot
		const botNickPattern = new RegExp(`^${process.env.IRC_NICK}\\d*$`);
		if (botNickPattern.test(nick)) return;
		if (nick === "****") return;

		// Find Slack channel mapping for this IRC channel
		const mapping = channelMappings.getByIrcChannel(to);
		if (!mapping) return;

		// Check if this IRC nick is mapped to a Slack user
		const userMapping = userMappings.getByIrcNick(nick);

		let iconUrl: string;
		if (userMapping) {
			iconUrl = `https://cachet.dunkirk.sh/users/${userMapping.slack_user_id}/r`;
		} else {
			iconUrl = getAvatarForNick(nick);
		}

		// Parse IRC formatting and mentions
		let messageText = parseIRCFormatting(text);
		messageText = convertIrcMentionsToSlack(messageText);

		// Format as action message with context block
		const actionText = `${nick} ${messageText}`;

		await slackClient.chat.postMessage({
			token: process.env.SLACK_BOT_TOKEN,
			channel: mapping.slack_channel_id,
			text: actionText,
			blocks: [
				{
					type: "context",
					elements: [
						{
							type: "image",
							image_url: iconUrl,
							alt_text: nick,
						},
						{
							type: "mrkdwn",
							text: actionText,
						},
					],
				},
			],
		});

		console.log(`IRC (${to}) → Slack (action): ${actionText}`);
	},
);

// Slack event handlers
slackApp.event("message", async ({ payload }) => {
	// Ignore bot messages and threaded messages
	if (payload.subtype && payload.subtype !== "file_share") return;
	if (payload.bot_id) return;
	if (payload.user === botUserId) return;
	if (payload.thread_ts) return;

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

		// Parse Slack mentions and replace with IRC nicks or display names
		let messageText = await convertSlackMentionsToIrc(payload.text);

		// Parse Slack markdown formatting
		messageText = parseSlackMarkdown(messageText);

		// Send message only if there's text content
		if (messageText.trim()) {
			const message = `<${username}> ${messageText}`;
			ircClient.say(mapping.irc_channel, message);
			console.log(`Slack → IRC: ${message}`);
		}

		// Handle file uploads
		if (payload.files && payload.files.length > 0) {
			try {
				const fileUrls = payload.files.map((file) => file.url_private);
				const data = await uploadToCDN(fileUrls);

				for (const file of data.files) {
					const fileMessage = `<${username}> ${file.deployedUrl}`;
					ircClient.say(mapping.irc_channel, fileMessage);
					console.log(`Slack → IRC (file): ${fileMessage}`);
				}
			} catch (error) {
				console.error("Error uploading files to CDN:", error);
			}
		}
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

export { slackApp, slackClient, ircClient };
