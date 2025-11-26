/**
 * Check if a user has permission to manage a Slack channel
 * Returns true if the user is:
 * - A global admin (in ADMINS env var)
 * - The channel creator
 * - A channel manager
 */
export async function canManageChannel(
	userId: string,
	channelId: string,
): Promise<boolean> {
	// Check if user is a global admin
	const admins = process.env.ADMINS?.split(",").map((id) => id.trim()) || [];
	if (admins.includes(userId)) {
		return true;
	}

	try {
		// Check if user is channel creator
		const channelInfo = await fetch(
			"https://slack.com/api/conversations.info",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
				},
				body: JSON.stringify({ channel: channelId }),
			},
		).then((res) => res.json());

		if (channelInfo.ok && channelInfo.channel?.creator === userId) {
			return true;
		}

		// Check if user is a channel manager
		if (
			process.env.SLACK_USER_COOKIE &&
			process.env.SLACK_USER_TOKEN &&
			process.env.SLACK_API_URL
		) {
			const formdata = new FormData();
			formdata.append("token", process.env.SLACK_USER_TOKEN);
			formdata.append("entity_id", channelId);

			const response = await fetch(
				`${process.env.SLACK_API_URL}/api/admin.roles.entity.listAssignments`,
				{
					method: "POST",
					headers: {
						Cookie: process.env.SLACK_USER_COOKIE,
					},
					body: formdata,
				},
			);

			const json = await response.json();

			if (json.ok) {
				const managers = json.role_assignments?.[0]?.users || [];
				if (managers.includes(userId)) {
					return true;
				}
			}
		}
	} catch (error) {
		console.error("Error checking channel permissions:", error);
	}

	return false;
}
