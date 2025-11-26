import { getCachetUser } from "./cachet";
import { userMappings } from "./db";

/**
 * Converts IRC @mentions and nick: mentions to Slack user mentions
 */
export function convertIrcMentionsToSlack(messageText: string): string {
	let result = messageText;

	// Find all @mentions and nick: mentions in the IRC message
	const atMentionPattern = /@(\w+)/g;
	const nickMentionPattern = /(\w+):/g;

	const atMentions = Array.from(result.matchAll(atMentionPattern));
	const nickMentions = Array.from(result.matchAll(nickMentionPattern));

	for (const match of atMentions) {
		const mentionedNick = match[1] as string;
		const mentionedUserMapping = userMappings.getByIrcNick(mentionedNick);
		if (mentionedUserMapping) {
			result = result.replace(
				match[0],
				`<@${mentionedUserMapping.slack_user_id}>`,
			);
		}
	}

	for (const match of nickMentions) {
		const mentionedNick = match[1] as string;
		const mentionedUserMapping = userMappings.getByIrcNick(mentionedNick);
		if (mentionedUserMapping) {
			result = result.replace(
				match[0],
				`<@${mentionedUserMapping.slack_user_id}>:`,
			);
		}
	}

	return result;
}

/**
 * Converts Slack user mentions to IRC @mentions, with Cachet fallback
 */
export async function convertSlackMentionsToIrc(
	messageText: string,
): Promise<string> {
	let result = messageText;
	const mentionRegex = /<@(U[A-Z0-9]+)(\|([^>]+))?>/g;
	const mentions = Array.from(result.matchAll(mentionRegex));

	for (const match of mentions) {
		const userId = match[1] as string;
		const displayName = match[3] as string; // The name part after |

		// Check if user has a mapped IRC nick
		const mentionedUserMapping = userMappings.getBySlackUser(userId);
		if (mentionedUserMapping) {
			result = result.replace(match[0], `@${mentionedUserMapping.irc_nick}`);
		} else if (displayName) {
			// Use the display name from the mention format <@U123|name>
			result = result.replace(match[0], `@${displayName}`);
		} else {
			// Fallback to Cachet lookup
			const data = await getCachetUser(userId);
			if (data) {
				result = result.replace(match[0], `@${data.displayName}`);
			}
		}
	}

	return result;
}
