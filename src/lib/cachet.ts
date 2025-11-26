import type { CachetUser } from "../types";

/**
 * Fetches user information from Cachet API
 */
export async function getCachetUser(
	userId: string,
): Promise<CachetUser | null> {
	try {
		const response = await fetch(`https://cachet.dunkirk.sh/users/${userId}`, {
			tls: { rejectUnauthorized: false },
		});
		if (response.ok) {
			return (await response.json()) as CachetUser;
		}
		return null;
	} catch (error) {
		console.error(`Error fetching user ${userId} from cachet:`, error);
		return null;
	}
}
