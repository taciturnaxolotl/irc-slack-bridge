import { getCachetUser } from "./cachet";

interface CachedUserInfo {
	name: string;
	realName: string;
	timestamp: number;
}

interface SlackClient {
	users: {
		info: (params: { token: string; user: string }) => Promise<{
			user?: {
				name?: string;
				real_name?: string;
			};
		}>;
	};
}

const userCache = new Map<string, CachedUserInfo>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get user info from cache or fetch from Cachet (if enabled) or Slack API
 * If displayName is provided (from Slack event), use that directly and cache it
 */
export async function getUserInfo(
	userId: string,
	slackClient: SlackClient,
	displayName?: string,
): Promise<{ name: string; realName: string } | null> {
	const cached = userCache.get(userId);
	const now = Date.now();

	if (cached && now - cached.timestamp < CACHE_TTL) {
		return { name: cached.name, realName: cached.realName };
	}

	// If we have a display name from the event, use it directly
	if (displayName) {
		userCache.set(userId, {
			name: displayName,
			realName: displayName,
			timestamp: now,
		});

		return { name: displayName, realName: displayName };
	}

	// Try Cachet first if enabled (it has its own caching)
	if (process.env.CACHET_ENABLED === "true") {
		try {
			const cachetUser = await getCachetUser(userId);
			if (cachetUser) {
				const name = cachetUser.displayName || "Unknown";
				const realName = cachetUser.displayName || "Unknown";

				userCache.set(userId, {
					name,
					realName,
					timestamp: now,
				});

				return { name, realName };
			}
		} catch (error) {
			console.error(`Error fetching user from Cachet for ${userId}:`, error);
		}
	}

	// Fallback to Slack API
	try {
		const userInfo = await slackClient.users.info({
			token: process.env.SLACK_BOT_TOKEN,
			user: userId,
		});

		const name = userInfo.user?.name || "Unknown";
		const realName = userInfo.user?.real_name || name;

		userCache.set(userId, {
			name,
			realName,
			timestamp: now,
		});

		return { name, realName };
	} catch (error) {
		console.error(`Error fetching user info for ${userId}:`, error);
		return null;
	}
}

/**
 * Clear expired entries from cache
 */
export function cleanupUserCache(): void {
	const now = Date.now();
	for (const [userId, info] of userCache.entries()) {
		if (now - info.timestamp > CACHE_TTL) {
			userCache.delete(userId);
		}
	}
}
