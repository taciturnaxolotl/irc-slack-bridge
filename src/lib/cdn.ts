import type { CDNUploadResponse } from "../types";

export async function uploadToCDN(
	fileUrls: string[],
): Promise<CDNUploadResponse> {
	const response = await fetch("https://cdn.hackclub.com/api/v3/new", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.CDN_TOKEN}`,
			"X-Download-Authorization": `Bearer ${process.env.SLACK_BOT_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(fileUrls),
	});

	if (!response.ok) {
		throw new Error(`CDN upload failed: ${response.statusText}`);
	}

	return (await response.json()) as CDNUploadResponse;
}
