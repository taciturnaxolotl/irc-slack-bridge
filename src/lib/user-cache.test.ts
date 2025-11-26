import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanupUserCache, getUserInfo } from "./user-cache";

describe("user-cache", () => {
	const mockSlackClient = {
		users: {
			info: mock(async () => ({
				user: {
					name: "testuser",
					real_name: "Test User",
				},
			})),
		},
	};

	afterEach(() => {
		cleanupUserCache();
		mockSlackClient.users.info.mockClear();
		mockSlackClient.users.info.mockReset();
	});

	describe("getUserInfo", () => {
		test("fetches user info from Slack on cache miss", async () => {
			const client = {
				users: {
					info: mock(async () => ({
						user: {
							name: "testuser",
							real_name: "Test User",
						},
					})),
				},
			};

			const result = await getUserInfo("U123", client);

			expect(result).toEqual({
				name: "testuser",
				realName: "Test User",
			});
			expect(client.users.info).toHaveBeenCalledTimes(1);
		});

		test("returns cached data on cache hit", async () => {
			const client = {
				users: {
					info: mock(async () => ({
						user: {
							name: "testuser",
							real_name: "Test User",
						},
					})),
				},
			};

			// First call - cache miss
			await getUserInfo("U124", client);
			expect(client.users.info).toHaveBeenCalledTimes(1);

			// Second call - cache hit
			const result = await getUserInfo("U124", client);
			expect(result).toEqual({
				name: "testuser",
				realName: "Test User",
			});
			expect(client.users.info).toHaveBeenCalledTimes(1); // Still 1
		});

		test("uses name as fallback for real_name", async () => {
			const client = {
				users: {
					info: mock(async () => ({
						user: {
							name: "testuser",
						},
					})),
				},
			};

			const result = await getUserInfo("U456", client);
			expect(result).toEqual({
				name: "testuser",
				realName: "testuser",
			});
		});

		test("handles missing user data gracefully", async () => {
			const client = {
				users: {
					info: mock(async () => ({})),
				},
			};

			const result = await getUserInfo("U789", client);
			expect(result).toEqual({
				name: "Unknown",
				realName: "Unknown",
			});
		});

		test("handles Slack API errors", async () => {
			const client = {
				users: {
					info: mock(async () => {
						throw new Error("API Error");
					}),
				},
			};

			const result = await getUserInfo("U999", client);
			expect(result).toBeNull();
		});

		test("caches different users separately", async () => {
			const client = {
				users: {
					info: mock(async ({ user }: { user: string }) => {
						if (user === "U111") {
							return { user: { name: "alice", real_name: "Alice" } };
						}
						return { user: { name: "bob", real_name: "Bob" } };
					}),
				},
			};

			const result1 = await getUserInfo("U111", client);
			const result2 = await getUserInfo("U222", client);

			expect(result1?.name).toBe("alice");
			expect(result2?.name).toBe("bob");
			expect(client.users.info).toHaveBeenCalledTimes(2);

			// Both should be cached now
			await getUserInfo("U111", client);
			await getUserInfo("U222", client);
			expect(client.users.info).toHaveBeenCalledTimes(2); // Still 2
		});
	});

	describe("cleanupUserCache", () => {
		test("cleanup runs without errors", () => {
			// Just test that cleanup doesn't throw
			expect(() => cleanupUserCache()).not.toThrow();
		});
	});
});
