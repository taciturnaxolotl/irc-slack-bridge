import { describe, expect, test } from "bun:test";
import { convertIrcMentionsToSlack } from "./mentions";
import { userMappings } from "./db";

describe("convertIrcMentionsToSlack", () => {
	test("converts @mention when user mapping exists", () => {
		// Setup test data
		userMappings.create("U123", "testuser");

		const result = convertIrcMentionsToSlack("Hey @testuser how are you?");
		expect(result).toBe("Hey <@U123> how are you?");

		// Cleanup
		userMappings.delete("U123");
	});

	test("leaves @mention unchanged when no mapping exists", () => {
		const result = convertIrcMentionsToSlack("Hey @unknownuser");
		expect(result).toBe("Hey @unknownuser");
	});

	test("converts nick: mention when user mapping exists", () => {
		userMappings.create("U456", "alice");

		const result = convertIrcMentionsToSlack("alice: hello");
		expect(result).toBe("<@U456>: hello");

		userMappings.delete("U456");
	});

	test("leaves nick: unchanged when no mapping exists", () => {
		const result = convertIrcMentionsToSlack("bob: hello");
		expect(result).toBe("bob: hello");
	});

	test("handles multiple mentions", () => {
		userMappings.create("U123", "alice");
		userMappings.create("U456", "bob");

		const result = convertIrcMentionsToSlack("@alice and bob: hello!");
		expect(result).toBe("<@U123> and <@U456>: hello!");

		userMappings.delete("U123");
		userMappings.delete("U456");
	});

	test("handles mixed mapped and unmapped mentions", () => {
		userMappings.create("U123", "alice");

		const result = convertIrcMentionsToSlack("@alice and @unknown user");
		expect(result).toContain("<@U123>");
		expect(result).toContain("@unknown");

		userMappings.delete("U123");
	});
});
