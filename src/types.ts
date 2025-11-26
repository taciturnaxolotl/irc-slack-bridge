export interface CachetUser {
	type: "user";
	id: string;
	userId: string;
	displayName: string;
	pronouns: string;
	imageUrl: string;
	expiration: string;
}

export interface CDNUploadResponse {
	files: Array<{
		deployedUrl: string;
		originalUrl: string;
	}>;
}
