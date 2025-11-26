import { SlackApp } from "slack-edge";
import { version } from "./package.json";
import * as irc from "irc-framework";

const missingEnvVars = [];
if (!process.env.SLACK_BOT_TOKEN) missingEnvVars.push("SLACK_BOT_TOKEN");
if (!process.env.SLACK_SIGNING_SECRET) missingEnvVars.push("SLACK_SIGNING_SECRET");
if (!process.env.ADMINS) missingEnvVars.push("ADMINS");
if (!process.env.IRC_NICK) missingEnvVars.push("IRC_NICK");
if (!process.env.IRC_CHANNEL) missingEnvVars.push("IRC_CHANNEL");

if (missingEnvVars.length > 0) {
	throw new Error(
		`Missing required environment variables: ${missingEnvVars.join(", ")}`,
	);
}

const slackApp = new SlackApp({
	env: {
		SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
		SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
		SLACK_LOGGING_LEVEL: "INFO",
	},
	startLazyListenerAfterAck: true,
});
const slackClient = slackApp.client;

// IRC client setup
const ircClient = new irc.Client();
ircClient.connect({
	host: "irc.hackclub.com",
	port: 6667,
	tls: false,
	nick: process.env.IRC_NICK,
	username: process.env.IRC_NICK,
	gecos: "Slack IRC Bridge",
	auto_reconnect: true,
	auto_reconnect_wait: 4000,
	auto_reconnect_max_retries: 0,
});

const ircChannel = process.env.IRC_CHANNEL;
const slackChannel = process.env.SLACK_CHANNEL;

// IRC event handlers
ircClient.on("registered", () => {
	console.log("Connected to IRC server");
	ircClient.join(ircChannel);
});

ircClient.on("join", (event) => {
	if (event.nick === ircClient.user.nick) {
		console.log(`Joined IRC channel: ${event.channel}`);
	}
});

ircClient.on("message", async (event) => {
	if (event.nick === ircClient.user.nick) return;
	if (event.nick === "****") return;
	
	if (slackChannel) {
		try {
			await slackClient.chat.postMessage({
				token: process.env.SLACK_BOT_TOKEN,
				channel: slackChannel,
				text: event.message,
				username: event.nick,
				unfurl_links: false,
				unfurl_media: false,
			});
		} catch (error) {
			console.error("Error posting to Slack:", error);
		}
	}
});

ircClient.on("close", () => {
	console.log("Disconnected from IRC server");
});

ircClient.on("error", (error) => {
	console.error("IRC error:", error);
});

// Slack event handlers
slackApp.event("message", async ({ payload }) => {
	if (payload.subtype) return;
	if (payload.bot_id) return;
	if (!slackChannel || payload.channel !== slackChannel) return;

	try {
		const userInfo = await slackClient.users.info({
			token: process.env.SLACK_BOT_TOKEN,
			user: payload.user,
		});
		
		const username = userInfo.user?.real_name || userInfo.user?.name || "Unknown";
		const message = `<${username}> ${payload.text}`;
		
		ircClient.say(ircChannel, message);
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
console.log(`Connecting to IRC: irc.hackclub.com:6667 as ${process.env.IRC_NICK}`);
console.log(`IRC Channel: ${ircChannel}`);
console.log(`Slack Channel: ${slackChannel || "Not configured (IRC->Slack only)"}`);

export { slackApp, slackClient, ircClient, version };

