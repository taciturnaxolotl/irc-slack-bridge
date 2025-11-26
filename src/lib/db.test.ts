import { afterEach, describe, expect, test } from "bun:test";
import { channelMappings, userMappings } from "./db";

describe("channelMappings", () => {
	const testSlackChannel = "C123TEST";
	const testIrcChannel = "#test-channel";

	afterEach(() => {
		// Cleanup test data
		try {
			channelMappings.delete(testSlackChannel);
		} catch {
			// Ignore if doesn't exist
		}
	});

	test("creates a channel mapping", () => {
		channelMappings.create(testSlackChannel, testIrcChannel);
		const mapping = channelMappings.getBySlackChannel(testSlackChannel);

		expect(mapping).toBeDefined();
		expect(mapping?.slack_channel_id).toBe(testSlackChannel);
		expect(mapping?.irc_channel).toBe(testIrcChannel);
	});

	test("retrieves mapping by Slack channel ID", () => {
		channelMappings.create(testSlackChannel, testIrcChannel);
		const mapping = channelMappings.getBySlackChannel(testSlackChannel);

		expect(mapping).not.toBeNull();
		expect(mapping?.irc_channel).toBe(testIrcChannel);
	});

	test("retrieves mapping by IRC channel", () => {
		channelMappings.create(testSlackChannel, testIrcChannel);
		const mapping = channelMappings.getByIrcChannel(testIrcChannel);

		expect(mapping).not.toBeNull();
		expect(mapping?.slack_channel_id).toBe(testSlackChannel);
	});

	test("returns null for non-existent mapping", () => {
		const mapping = channelMappings.getBySlackChannel("C999NOTFOUND");
		expect(mapping).toBeNull();
	});

	test("deletes a channel mapping", () => {
		channelMappings.create(testSlackChannel, testIrcChannel);
		channelMappings.delete(testSlackChannel);

		const mapping = channelMappings.getBySlackChannel(testSlackChannel);
		expect(mapping).toBeNull();
	});

	test("replaces existing mapping on create", () => {
		channelMappings.create(testSlackChannel, "#old-channel");
		channelMappings.create(testSlackChannel, testIrcChannel);

		const mapping = channelMappings.getBySlackChannel(testSlackChannel);
		expect(mapping?.irc_channel).toBe(testIrcChannel);
	});

	test("getAll returns all mappings", () => {
		const testChannel2 = "C456TEST";
		const testIrc2 = "#another-channel";

		channelMappings.create(testSlackChannel, testIrcChannel);
		channelMappings.create(testChannel2, testIrc2);

		const all = channelMappings.getAll();
		const testMappings = all.filter(
			(m) =>
				m.slack_channel_id === testSlackChannel ||
				m.slack_channel_id === testChannel2,
		);

		expect(testMappings.length).toBeGreaterThanOrEqual(2);

		// Cleanup
		channelMappings.delete(testChannel2);
	});
});

describe("userMappings", () => {
	const testSlackUser = "U123TEST";
	const testIrcNick = "testnick";

	afterEach(() => {
		// Cleanup test data
		try {
			userMappings.delete(testSlackUser);
		} catch {
			// Ignore if doesn't exist
		}
	});

	test("creates a user mapping", () => {
		userMappings.create(testSlackUser, testIrcNick);
		const mapping = userMappings.getBySlackUser(testSlackUser);

		expect(mapping).toBeDefined();
		expect(mapping?.slack_user_id).toBe(testSlackUser);
		expect(mapping?.irc_nick).toBe(testIrcNick);
	});

	test("retrieves mapping by Slack user ID", () => {
		userMappings.create(testSlackUser, testIrcNick);
		const mapping = userMappings.getBySlackUser(testSlackUser);

		expect(mapping).not.toBeNull();
		expect(mapping?.irc_nick).toBe(testIrcNick);
	});

	test("retrieves mapping by IRC nick", () => {
		userMappings.create(testSlackUser, testIrcNick);
		const mapping = userMappings.getByIrcNick(testIrcNick);

		expect(mapping).not.toBeNull();
		expect(mapping?.slack_user_id).toBe(testSlackUser);
	});

	test("returns null for non-existent mapping", () => {
		const mapping = userMappings.getBySlackUser("U999NOTFOUND");
		expect(mapping).toBeNull();
	});

	test("deletes a user mapping", () => {
		userMappings.create(testSlackUser, testIrcNick);
		userMappings.delete(testSlackUser);

		const mapping = userMappings.getBySlackUser(testSlackUser);
		expect(mapping).toBeNull();
	});

	test("replaces existing mapping on create", () => {
		userMappings.create(testSlackUser, "oldnick");
		userMappings.create(testSlackUser, testIrcNick);

		const mapping = userMappings.getBySlackUser(testSlackUser);
		expect(mapping?.irc_nick).toBe(testIrcNick);
	});

	test("getAll returns all mappings", () => {
		const testUser2 = "U456TEST";
		const testNick2 = "anothernick";

		userMappings.create(testSlackUser, testIrcNick);
		userMappings.create(testUser2, testNick2);

		const all = userMappings.getAll();
		const testMappings = all.filter(
			(m) => m.slack_user_id === testSlackUser || m.slack_user_id === testUser2,
		);

		expect(testMappings.length).toBeGreaterThanOrEqual(2);

		// Cleanup
		userMappings.delete(testUser2);
	});
});
