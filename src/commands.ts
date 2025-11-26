import { channelMappings, userMappings } from "./db";
import { slackApp, ircClient } from "./index";

export function registerCommands() {
	// Link Slack channel to IRC channel
	slackApp.command("/irc-bridge-channel", async ({ payload, context }) => {
		const args = payload.text.trim().split(/\s+/);
		const ircChannel = args[0];

		if (!ircChannel || !ircChannel.startsWith("#")) {
			return {
				text: "Usage: `/irc-bridge-channel #irc-channel`\nExample: `/irc-bridge-channel #lounge`",
			};
		}

		const slackChannelId = payload.channel_id;

		try {
			// Create the mapping
			channelMappings.create(slackChannelId, ircChannel);

			// Join the IRC channel
			ircClient.join(ircChannel);

			// Join the Slack channel if not already in it
			await context.client.conversations.join({
				channel: slackChannelId,
			});

			return {
				text: `✅ Successfully bridged this channel to ${ircChannel}`,
			};
		} catch (error) {
			console.error("Error creating channel mapping:", error);
			return {
				text: `❌ Failed to bridge channel: ${error}`,
			};
		}
	});

	// Unlink Slack channel from IRC
	slackApp.command("/irc-unbridge-channel", async ({ payload }) => {
		const slackChannelId = payload.channel_id;

		try {
			const mapping = channelMappings.getBySlackChannel(slackChannelId);
			if (!mapping) {
				return {
					text: "❌ This channel is not bridged to IRC",
				};
			}

			channelMappings.delete(slackChannelId);

			return {
				text: `✅ Removed bridge to ${mapping.irc_channel}`,
			};
		} catch (error) {
			console.error("Error removing channel mapping:", error);
			return {
				text: `❌ Failed to remove bridge: ${error}`,
			};
		}
	});

	// Link Slack user to IRC nick
	slackApp.command("/irc-bridge-user", async ({ payload }) => {
		const args = payload.text.trim().split(/\s+/);
		const ircNick = args[0];

		if (!ircNick) {
			return {
				text: "Usage: `/irc-bridge-user <irc-nick>`\nExample: `/irc-bridge-user myircnick`",
			};
		}

		const slackUserId = payload.user_id;

		try {
			userMappings.create(slackUserId, ircNick);
			console.log(`Created user mapping: ${slackUserId} -> ${ircNick}`);

			return {
				text: `✅ Successfully linked your account to IRC nick: ${ircNick}`,
			};
		} catch (error) {
			console.error("Error creating user mapping:", error);
			return {
				text: `❌ Failed to link user: ${error}`,
			};
		}
	});

	// Unlink Slack user from IRC
	slackApp.command("/irc-unbridge-user", async ({ payload }) => {
		const slackUserId = payload.user_id;

		try {
			const mapping = userMappings.getBySlackUser(slackUserId);
			if (!mapping) {
				return {
					text: "❌ You don't have an IRC nick mapping",
				};
			}

			userMappings.delete(slackUserId);

			return {
				text: `✅ Removed link to IRC nick: ${mapping.irc_nick}`,
			};
		} catch (error) {
			console.error("Error removing user mapping:", error);
			return {
				text: `❌ Failed to remove link: ${error}`,
			};
		}
	});

	// List channel mappings
	slackApp.command("/irc-bridge-list", async ({ payload }) => {
		const channelMaps = channelMappings.getAll();
		const userMaps = userMappings.getAll();

		let text = "*Channel Bridges:*\n";
		if (channelMaps.length === 0) {
			text += "None\n";
		} else {
			for (const map of channelMaps) {
				text += `• <#${map.slack_channel_id}> ↔️ ${map.irc_channel}\n`;
			}
		}

		text += "\n*User Mappings:*\n";
		if (userMaps.length === 0) {
			text += "None\n";
		} else {
			for (const map of userMaps) {
				text += `• <@${map.slack_user_id}> ↔️ ${map.irc_nick}\n`;
			}
		}

		return {
			text,
		};
	});
}
