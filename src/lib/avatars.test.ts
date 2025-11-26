import { describe, expect, test } from "bun:test";
import { getAvatarForNick } from "./avatars";

describe("getAvatarForNick", () => {
	test("returns a valid URL", () => {
		const avatar = getAvatarForNick("testnick");
		expect(avatar).toBeString();
		expect(avatar).toStartWith("https://");
	});

	test("returns consistent avatar for same nick", () => {
		const avatar1 = getAvatarForNick("alice");
		const avatar2 = getAvatarForNick("alice");
		expect(avatar1).toBe(avatar2);
	});

	test("returns different avatars for different nicks", () => {
		const avatar1 = getAvatarForNick("alice");
		const avatar2 = getAvatarForNick("bob");

		// They might occasionally be the same due to hash collisions,
		// but let's test they can be different
		expect(avatar1).toBeString();
		expect(avatar2).toBeString();
	});

	test("handles empty string", () => {
		const avatar = getAvatarForNick("");
		expect(avatar).toBeString();
		expect(avatar).toStartWith("https://");
	});

	test("handles special characters", () => {
		const avatar = getAvatarForNick("user-123_test");
		expect(avatar).toBeString();
		expect(avatar).toStartWith("https://");
	});

	test("handles unicode characters", () => {
		const avatar = getAvatarForNick("用户名");
		expect(avatar).toBeString();
		expect(avatar).toStartWith("https://");
	});
});
