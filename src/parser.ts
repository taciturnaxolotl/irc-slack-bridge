/**
 * Parse Slack mrkdwn formatting and convert to IRC-friendly plain text
 */
export function parseSlackMarkdown(text: string): string {
	let parsed = text;

	// Replace channel mentions <#C123ABC|channel-name> or <#C123ABC>
	parsed = parsed.replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1");
	parsed = parsed.replace(/<#[A-Z0-9]+>/g, "#channel");

	// Replace links <http://example.com|text> or <http://example.com>
	parsed = parsed.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2 ($1)");
	parsed = parsed.replace(/<(https?:\/\/[^>]+)>/g, "$1");

	// Replace mailto links <mailto:email|text>
	parsed = parsed.replace(/<mailto:([^|>]+)\|([^>]+)>/g, "$2 <$1>");
	parsed = parsed.replace(/<mailto:([^>]+)>/g, "$1");

	// Replace special mentions
	parsed = parsed.replace(/<!here>/g, "@here");
	parsed = parsed.replace(/<!channel>/g, "@channel");
	parsed = parsed.replace(/<!everyone>/g, "@everyone");

	// Replace user group mentions <!subteam^GROUP_ID|handle>
	parsed = parsed.replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "@$1");
	parsed = parsed.replace(/<!subteam\^[A-Z0-9]+>/g, "@group");

	// Date formatting - just use fallback text
	parsed = parsed.replace(/<!date\^[0-9]+\^[^|]+\|([^>]+)>/g, "$1");

	// Replace Slack bold *text* with IRC bold \x02text\x02
	parsed = parsed.replace(/\*((?:[^\*]|\\\*)+)\*/g, "\x02$1\x02");

	// Replace Slack italic _text_ with IRC italic \x1Dtext\x1D
	parsed = parsed.replace(/_((?:[^_]|\\_)+)_/g, "\x1D$1\x1D");

	// Replace Slack strikethrough ~text~ with plain text (IRC doesn't support strikethrough well)
	parsed = parsed.replace(/~((?:[^~]|\\~)+)~/g, "$1");

	// Replace code blocks ```code``` with plain text
	parsed = parsed.replace(/```([^`]+)```/g, "$1");

	// Replace inline code `code` with plain text
	parsed = parsed.replace(/`([^`]+)`/g, "$1");

	// Handle block quotes - prefix with >
	parsed = parsed.replace(/^>/gm, ">");

	// Unescape HTML entities
	parsed = parsed.replace(/&amp;/g, "&");
	parsed = parsed.replace(/&lt;/g, "<");
	parsed = parsed.replace(/&gt;/g, ">");

	return parsed;
}

/**
 * Parse IRC formatting codes and convert to Slack mrkdwn
 */
export function parseIRCFormatting(text: string): string {
	let parsed = text;

	// IRC color codes - strip them (Slack doesn't support colors in the same way)
	// \x03 followed by optional color codes
	parsed = parsed.replace(/\x03(\d{1,2}(,\d{1,2})?)?/g, "");

	// IRC bold \x02text\x02 -> Slack bold *text*
	parsed = parsed.replace(/\x02([^\x02]*)\x02/g, "*$1*");

	// IRC italic \x1D text\x1D -> Slack italic _text_
	parsed = parsed.replace(/\x1D([^\x1D]*)\x1D/g, "_$1_");

	// IRC underline \x1F text\x1F -> Slack doesn't have underline, use italic instead
	parsed = parsed.replace(/\x1F([^\x1F]*)\x1F/g, "_$1_");

	// IRC reverse/inverse \x16 - strip it (Slack doesn't support)
	parsed = parsed.replace(/\x16/g, "");

	// IRC reset \x0F - strip it
	parsed = parsed.replace(/\x0F/g, "");

	// Escape special Slack characters that would be interpreted as formatting
	parsed = parsed.replace(/&/g, "&amp;");
	parsed = parsed.replace(/</g, "&lt;");
	parsed = parsed.replace(/>/g, "&gt;");

	return parsed;
}

