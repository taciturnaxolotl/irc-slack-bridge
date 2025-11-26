import * as irc from "irc";
import { SlackApp } from "slack-edge";
import { version } from "../package.json";
import { registerCommands } from "./commands";
import { channelMappings, userMappings } from "./db";
import { parseIRCFormatting, parseSlackMarkdown } from "./parser";
import type { CachetUser } from "./types";

// Default profile pictures for unmapped IRC users
const DEFAULT_AVATARS = [
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/4183627c4d26c56c915e104a8a7374f43acd1733_pfp__1_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/389b1e6bd4248a7e5dd88e14c1adb8eb01267080_pfp__2_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/03011a5e59548191de058f33ccd1d1cb1d64f2a0_pfp__3_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/f9c57b88fbd4633114c1864bcc2968db555dbd2a_pfp__4_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/e61a8cabee5a749588125242747b65122fb94205_pfp.png",
];

// Hash function for stable avatar selection
function getAvatarForNick(nick: string): string {
	let hash = 0;
	for (let i = 0; i < nick.length; i++) {
		hash = (hash << 5) - hash + nick.charCodeAt(i);
		hash = hash & hash; // Convert to 32bit integer
	}
	return DEFAULT_AVATARS[Math.abs(hash) % DEFAULT_AVATARS.length];
}

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
ircClient.addListener("notice", async (nick: string, to: string, text: string) => {
	if (nick !== "NickServ") return;
	
	console.log(`NickServ: ${text}`);
	
	// Check for successful authentication
	if (text.includes("You are now identified") || text.includes("Password accepted")) {
		console.log("✓ Successfully authenticated with NickServ");
		isAuthenticated = true;
		
		// Join channels after successful auth
		const mappings = channelMappings.getAll();
		for (const mapping of mappings) {
			ircClient.join(mapping.irc_channel);
		}
	}
	// Check if nick is not registered
	else if (text.includes("isn't registered") || text.includes("not registered")) {
		console.log("Nick not registered, registering with NickServ...");
		if (process.env.NICKSERV_PASSWORD && process.env.NICKSERV_EMAIL) {
			ircClient.say("NickServ", `REGISTER ${process.env.NICKSERV_PASSWORD} ${process.env.NICKSERV_EMAIL}`);
		} else {
			console.error("Cannot register: NICKSERV_EMAIL not configured");
		}
	}
	// Check for failed authentication
	else if (text.includes("Invalid password") || text.includes("Access denied")) {
		console.error("✗ NickServ authentication failed: Invalid password");
	}
});

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

		// Find all @mentions and nick: mentions in the IRC message
		const atMentionPattern = /@(\w+)/g;
		const nickMentionPattern = /(\w+):/g;

		const atMentions = Array.from(messageText.matchAll(atMentionPattern));
		const nickMentions = Array.from(messageText.matchAll(nickMentionPattern));

		for (const match of atMentions) {
			const mentionedNick = match[1] as string;
			const mentionedUserMapping = userMappings.getByIrcNick(mentionedNick);
			if (mentionedUserMapping) {
				messageText = messageText.replace(
					match[0],
					`<@${mentionedUserMapping.slack_user_id}>`,
				);
			}
		}

		for (const match of nickMentions) {
			const mentionedNick = match[1] as string;
			const mentionedUserMapping = userMappings.getByIrcNick(mentionedNick);
			if (mentionedUserMapping) {
				messageText = messageText.replace(
					match[0],
					`<@${mentionedUserMapping.slack_user_id}>:`,
				);
			}
		}

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
					unfurl_links: false,
					unfurl_media: false,
				});
			}
			console.log(`IRC → Slack: <${nick}> ${text}`);
		} catch (error) {
			console.error("Error posting to Slack:", error);
		}
	},
);

ircClient.addListener("error", (error: string) => {
	console.error("IRC error:", error);
});

// Handle IRC /me actions
ircClient.addListener("action", async (nick: string, to: string, text: string) => {
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

	// Find all @mentions and nick: mentions in the IRC message
	const atMentionPattern = /@(\w+)/g;
	const nickMentionPattern = /(\w+):/g;

	const atMentions = Array.from(messageText.matchAll(atMentionPattern));
	const nickMentions = Array.from(messageText.matchAll(nickMentionPattern));

	for (const match of atMentions) {
		const mentionedNick = match[1] as string;
		const mentionedUserMapping = userMappings.getByIrcNick(mentionedNick);
		if (mentionedUserMapping) {
			messageText = messageText.replace(
				match[0],
				`<@${mentionedUserMapping.slack_user_id}>`,
			);
		}
	}

	for (const match of nickMentions) {
		const mentionedNick = match[1] as string;
		const mentionedUserMapping = userMappings.getByIrcNick(mentionedNick);
		if (mentionedUserMapping) {
			messageText = messageText.replace(
				match[0],
				`<@${mentionedUserMapping.slack_user_id}>:`,
			);
		}
	}

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

	console.log(`IRC → Slack (action): ${actionText}`);
});

// Slack event handlers
slackApp.event("message", async ({ payload, context }) => {
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
		let messageText = payload.text;
		const mentionRegex = /<@(U[A-Z0-9]+)(\|([^>]+))?>/g;
		const mentions = Array.from(messageText.matchAll(mentionRegex));

		for (const match of mentions) {
			const userId = match[1];
			const displayName = match[3]; // The name part after |
			
			// Check if user has a mapped IRC nick
			const mentionedUserMapping = userMappings.getBySlackUser(userId);
			if (mentionedUserMapping) {
				messageText = messageText.replace(match[0], `@${mentionedUserMapping.irc_nick}`);
			} else if (displayName) {
				// Use the display name from the mention format <@U123|name>
				messageText = messageText.replace(match[0], `@${displayName}`);
			} else {
				// Fallback to Cachet lookup
				try {
					const response = await fetch(
						`https://cachet.dunkirk.sh/users/${userId}`,
						{
							// @ts-ignore - Bun specific option
							tls: { rejectUnauthorized: false },
						},
					);
					if (response.ok) {
						const data = (await response.json()) as CachetUser;
						messageText = messageText.replace(match[0], `@${data.displayName}`);
					}
				} catch (error) {
					console.error(`Error fetching user ${userId} from cachet:`, error);
				}
			}
		}

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
				// Extract private file URLs
				const fileUrls = payload.files.map((file) => file.url_private);

				// Upload to Hack Club CDN
				const response = await fetch("https://cdn.hackclub.com/api/v3/new", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${process.env.CDN_TOKEN}`,
						"X-Download-Authorization": `Bearer ${process.env.SLACK_BOT_TOKEN}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(fileUrls),
				});

				if (response.ok) {
					const data = await response.json();

					// Send each uploaded file URL to IRC
					for (const file of data.files) {
						const fileMessage = `<${username}> ${file.deployedUrl}`;
						ircClient.say(mapping.irc_channel, fileMessage);
						console.log(`Slack → IRC (file): ${fileMessage}`);
					}
				} else {
					console.error("Failed to upload files to CDN:", response.statusText);
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
