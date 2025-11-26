import type { AnyMessageBlock, Block, BlockElement } from "slack-edge";
import { channelMappings, userMappings } from "./db";
import { slackApp, ircClient } from "./index";

export function registerCommands() {
	// Link Slack channel to IRC channel
	slackApp.command("/irc-bridge-channel", async ({ payload, context }) => {
		context.respond({
			response_type: "ephemeral",
			text: "Bridge channel command received",
			blocks: [
				{
					type: "input",
					block_id: "irc_channel_input",
					element: {
						type: "plain_text_input",
						action_id: "irc_channel",
						placeholder: {
							type: "plain_text",
							text: "#lounge",
						},
					},
					label: {
						type: "plain_text",
						text: "IRC Channel",
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Bridge Channel",
							},
							style: "primary",
							action_id: "bridge_channel_submit",
							value: payload.channel_id,
						},
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Cancel",
							},
							action_id: "cancel",
						},
					],
				},
			],
			replace_original: true,
		});
	});

	// Handle bridge channel submission
	slackApp.action("bridge_channel_submit", async ({ payload, context }) => {
		const stateValues = payload.state?.values;
		const ircChannel = stateValues?.irc_channel_input?.irc_channel?.value;
		// @ts-expect-error
		const slackChannelId = payload.actions?.[0]?.value;
		if (!context.respond) {
			return;
		}

		if (!ircChannel || !ircChannel.startsWith("#")) {
			context.respond({
				response_type: "ephemeral",
				text: "❌ IRC channel must start with #",
				replace_original: true,
			});
			return;
		}

		try {
			channelMappings.create(slackChannelId, ircChannel);
			ircClient.join(ircChannel);

			await context.client.conversations.join({
				channel: slackChannelId,
			});

			console.log(
				`Created channel mapping: ${slackChannelId} -> ${ircChannel}`,
			);

			context.respond({
				response_type: "ephemeral",
				text: `✅ Successfully bridged <#${slackChannelId}> to ${ircChannel}`,
				replace_original: true,
			});
		} catch (error) {
			console.error("Error creating channel mapping:", error);
			context.respond({
				response_type: "ephemeral",
				text: `❌ Failed to bridge channel: ${error}`,
				replace_original: true,
			});
		}
	});

	// Unlink Slack channel from IRC
	slackApp.command("/irc-unbridge-channel", async ({ payload, context }) => {
		const slackChannelId = payload.channel_id;
		const mapping = channelMappings.getBySlackChannel(slackChannelId);

		if (!mapping) {
			context.respond({
				response_type: "ephemeral",
				text: "❌ This channel is not bridged to IRC",
			});
			return;
		}

		context.respond({
			response_type: "ephemeral",
			text: "Are you sure you want to remove the bridge to *${mapping.irc_channel}*?",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Are you sure you want to remove the bridge to *${mapping.irc_channel}*?`,
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Remove Bridge",
							},
							style: "danger",
							action_id: "unbridge_channel_confirm",
							value: slackChannelId,
						},
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Cancel",
							},
							action_id: "cancel",
						},
					],
				},
			],
			replace_original: true,
		});
	});

	// Handle unbridge confirmation
	slackApp.action("unbridge_channel_confirm", async ({ payload, context }) => {
		// @ts-expect-error
		const slackChannelId = payload.actions?.[0]?.value;
		if (!context.respond) return;

		try {
			const mapping = channelMappings.getBySlackChannel(slackChannelId);
			if (!mapping) {
				context.respond({
					response_type: "ephemeral",
					text: "❌ This channel is not bridged to IRC",
					replace_original: true,
				});
				return;
			}

			channelMappings.delete(slackChannelId);
			console.log(
				`Removed channel mapping: ${slackChannelId} -> ${mapping.irc_channel}`,
			);

			context.respond({
				response_type: "ephemeral",
				text: `✅ Removed bridge to ${mapping.irc_channel}`,
				replace_original: true,
			});
		} catch (error) {
			console.error("Error removing channel mapping:", error);
			context.respond({
				response_type: "ephemeral",
				text: `❌ Failed to remove bridge: ${error}`,
				replace_original: true,
			});
		}
	});

	// Link Slack user to IRC nick
	slackApp.command("/irc-bridge-user", async ({ payload, context }) => {
		context.respond({
			response_type: "ephemeral",
			text: "Enter your IRC nickname",
			blocks: [
				{
					type: "input",
					block_id: "irc_nick_input",
					element: {
						type: "plain_text_input",
						action_id: "irc_nick",
						placeholder: {
							type: "plain_text",
							text: "myircnick",
						},
					},
					label: {
						type: "plain_text",
						text: "IRC Nickname",
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Link Account",
							},
							style: "primary",
							action_id: "bridge_user_submit",
							value: payload.user_id,
						},
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Cancel",
							},
							action_id: "cancel",
						},
					],
				},
			],
			replace_original: true,
		});
	});

	// Handle bridge user submission
	slackApp.action("bridge_user_submit", async ({ payload, context }) => {
		const stateValues = payload.state?.values;
		const ircNick = stateValues?.irc_nick_input?.irc_nick?.value;
		// @ts-expect-error
		const slackUserId = payload.actions?.[0]?.value;
		if (!context.respond) {
			return;
		}

		if (!ircNick) {
			context.respond({
				response_type: "ephemeral",
				text: "❌ IRC nickname is required",
				replace_original: true,
			});
			return;
		}

		try {
			userMappings.create(slackUserId, ircNick);
			console.log(`Created user mapping: ${slackUserId} -> ${ircNick}`);

			context.respond({
				response_type: "ephemeral",
				text: `✅ Successfully linked your account to IRC nick: *${ircNick}*`,
				replace_original: true,
			});
		} catch (error) {
			console.error("Error creating user mapping:", error);
			context.respond({
				response_type: "ephemeral",
				text: `❌ Failed to link user: ${error}`,
				replace_original: true,
			});
		}
	});

	// Unlink Slack user from IRC
	slackApp.command("/irc-unbridge-user", async ({ payload, context }) => {
		const slackUserId = payload.user_id;
		const mapping = userMappings.getBySlackUser(slackUserId);

		if (!mapping) {
			context.respond({
				response_type: "ephemeral",
				text: "❌ You don't have an IRC nick mapping",
			});
			return;
		}

		context.respond({
			response_type: "ephemeral",
			text: "Are you sure you want to remove your link to IRC nick *${mapping.irc_nick}*?",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Are you sure you want to remove your link to IRC nick *${mapping.irc_nick}*?`,
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Remove Link",
							},
							style: "danger",
							action_id: "unbridge_user_confirm",
							value: slackUserId,
						},
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Cancel",
							},
							action_id: "cancel",
						},
					],
				},
			],
			replace_original: true,
		});
	});

	// Handle unbridge user confirmation
	slackApp.action("unbridge_user_confirm", async ({ payload, context }) => {
		// @ts-expect-error
		const slackUserId = payload.actions?.[0]?.value;
		if (!context.respond) {
			return;
		}

		try {
			const mapping = userMappings.getBySlackUser(slackUserId);
			if (!mapping) {
				context.respond({
					response_type: "ephemeral",
					text: "❌ You don't have an IRC nick mapping",
					replace_original: true,
				});
				return;
			}

			userMappings.delete(slackUserId);
			console.log(
				`Removed user mapping: ${slackUserId} -> ${mapping.irc_nick}`,
			);

			context.respond({
				response_type: "ephemeral",
				text: `✅ Removed link to IRC nick: ${mapping.irc_nick}`,
				replace_original: true,
			});
		} catch (error) {
			console.error("Error removing user mapping:", error);
			context.respond({
				response_type: "ephemeral",
				text: `❌ Failed to remove link: ${error}`,
				replace_original: true,
			});
		}
	});

	// Handle cancel button
	slackApp.action("cancel", async ({ context }) => {
		if (!context.respond) return;

		context.respond({
			response_type: "ephemeral",
			delete_original: true,
		});
	});

	// List channel mappings
	slackApp.command("/irc-bridge-list", async ({ payload, context }) => {
		const channelMaps = channelMappings.getAll();
		const userMaps = userMappings.getAll();

		const blocks: AnyMessageBlock[] = [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "IRC Bridge Status",
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: "*Channel Bridges:*",
				},
			},
		];

		if (channelMaps.length === 0) {
			blocks.push({
				type: "section",
				text: {
					type: "mrkdwn",
					text: "_No channel bridges configured_",
				},
			});
		} else {
			for (const map of channelMaps) {
				blocks.push({
					type: "section",
					text: {
						type: "mrkdwn",
						text: `• <#${map.slack_channel_id}> ↔️ *${map.irc_channel}*`,
					},
				});
			}
		}

		blocks.push(
			{
				type: "divider",
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: "*User Mappings:*",
				},
			},
		);

		if (userMaps.length === 0) {
			blocks.push({
				type: "section",
				text: {
					type: "mrkdwn",
					text: "_No user mappings configured_",
				},
			});
		} else {
			for (const map of userMaps) {
				blocks.push({
					type: "section",
					text: {
						type: "mrkdwn",
						text: `• <@${map.slack_user_id}> ↔️ *${map.irc_nick}*`,
					},
				});
			}
		}

		context.respond({
			response_type: "ephemeral",
			text: "IRC mapping list",
			blocks,
			replace_original: true,
		});
	});
}
