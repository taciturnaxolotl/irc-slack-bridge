import { describe, expect, test, beforeEach } from "bun:test";
import { channelMappings, userMappings } from "./lib/db";

describe("channel mappings uniqueness", () => {
	beforeEach(() => {
		// Clean up mappings before each test
		const channels = channelMappings.getAll();
		for (const channel of channels) {
			channelMappings.delete(channel.slack_channel_id);
		}
	});

	test("prevents duplicate IRC channel mappings", () => {
		channelMappings.create("C001", "#test");
		
		const existing = channelMappings.getByIrcChannel("#test");
		expect(existing).not.toBeNull();
		expect(existing?.slack_channel_id).toBe("C001");

		// Trying to map a different Slack channel to the same IRC channel should be prevented
		const duplicate = channelMappings.getByIrcChannel("#test");
		expect(duplicate).not.toBeNull();
		expect(duplicate?.slack_channel_id).toBe("C001");
	});

	test("prevents duplicate Slack channel mappings", () => {
		channelMappings.create("C001", "#test");
		
		const existing = channelMappings.getBySlackChannel("C001");
		expect(existing).not.toBeNull();
		expect(existing?.irc_channel).toBe("#test");

		// The same Slack channel should keep its original mapping
		channelMappings.create("C001", "#new");
		const updated = channelMappings.getBySlackChannel("C001");
		expect(updated?.irc_channel).toBe("#new");
	});

	test("allows different channels to map to different IRC channels", () => {
		channelMappings.create("C001", "#test1");
		channelMappings.create("C002", "#test2");

		const mapping1 = channelMappings.getBySlackChannel("C001");
		const mapping2 = channelMappings.getBySlackChannel("C002");

		expect(mapping1?.irc_channel).toBe("#test1");
		expect(mapping2?.irc_channel).toBe("#test2");
	});
});

describe("user mappings uniqueness", () => {
	beforeEach(() => {
		// Clean up mappings before each test
		const users = userMappings.getAll();
		for (const user of users) {
			userMappings.delete(user.slack_user_id);
		}
	});

	test("prevents duplicate IRC nick mappings", () => {
		userMappings.create("U001", "testnick");
		
		const existing = userMappings.getByIrcNick("testnick");
		expect(existing).not.toBeNull();
		expect(existing?.slack_user_id).toBe("U001");

		// Trying to map a different Slack user to the same IRC nick should be prevented
		const duplicate = userMappings.getByIrcNick("testnick");
		expect(duplicate).not.toBeNull();
		expect(duplicate?.slack_user_id).toBe("U001");
	});

	test("prevents duplicate Slack user mappings", () => {
		userMappings.create("U001", "testnick");
		
		const existing = userMappings.getBySlackUser("U001");
		expect(existing).not.toBeNull();
		expect(existing?.irc_nick).toBe("testnick");

		// The same Slack user should keep its original mapping
		userMappings.create("U001", "newnick");
		const updated = userMappings.getBySlackUser("U001");
		expect(updated?.irc_nick).toBe("newnick");
	});

	test("allows different users to map to different IRC nicks", () => {
		userMappings.create("U001", "nick1");
		userMappings.create("U002", "nick2");

		const mapping1 = userMappings.getBySlackUser("U001");
		const mapping2 = userMappings.getBySlackUser("U002");

		expect(mapping1?.irc_nick).toBe("nick1");
		expect(mapping2?.irc_nick).toBe("nick2");
	});
});
