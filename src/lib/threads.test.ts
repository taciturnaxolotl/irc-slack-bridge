import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	generateThreadId,
	getThreadByThreadId,
	isFirstThreadMessage,
	updateThreadTimestamp,
} from "./threads";
import { threadTimestamps } from "./db";

describe("threads", () => {
	const testChannelId = "C123TEST";
	const testThreadTs = "1234567890.123456";

	afterEach(() => {
		// Clean up test data
		const thread = threadTimestamps.get(testThreadTs);
		if (thread) {
			threadTimestamps.cleanup(Date.now() + 1000);
		}
	});

	describe("generateThreadId", () => {
		test("generates a 5-character thread ID", () => {
			const threadId = generateThreadId(testThreadTs);
			expect(threadId).toBeString();
			expect(threadId.length).toBe(5);
		});

		test("generates consistent IDs for same input", () => {
			const id1 = generateThreadId(testThreadTs);
			const id2 = generateThreadId(testThreadTs);
			expect(id1).toBe(id2);
		});

		test("generates different IDs for different inputs", () => {
			const id1 = generateThreadId("1234567890.123456");
			const id2 = generateThreadId("9876543210.654321");
			expect(id1).not.toBe(id2);
		});

		test("generates alphanumeric IDs", () => {
			const threadId = generateThreadId(testThreadTs);
			expect(threadId).toMatch(/^[a-z0-9]{5}$/);
		});
	});

	describe("isFirstThreadMessage", () => {
		test("returns true for new thread", () => {
			const result = isFirstThreadMessage(testThreadTs);
			expect(result).toBe(true);
		});

		test("returns false for existing thread", () => {
			updateThreadTimestamp(testThreadTs, testChannelId);
			const result = isFirstThreadMessage(testThreadTs);
			expect(result).toBe(false);
		});
	});

	describe("updateThreadTimestamp", () => {
		test("creates new thread entry", () => {
			const threadId = updateThreadTimestamp(testThreadTs, testChannelId);

			expect(threadId).toBeString();
			expect(threadId.length).toBe(5);

			const thread = threadTimestamps.get(testThreadTs);
			expect(thread).toBeDefined();
			expect(thread?.thread_id).toBe(threadId);
			expect(thread?.slack_channel_id).toBe(testChannelId);
		});

		test("updates existing thread timestamp", () => {
			const threadId1 = updateThreadTimestamp(testThreadTs, testChannelId);
			const thread1 = threadTimestamps.get(testThreadTs);
			const timestamp1 = thread1?.last_message_time;

			// Wait a bit to ensure timestamp changes
			Bun.sleepSync(10);

			const threadId2 = updateThreadTimestamp(testThreadTs, testChannelId);
			const thread2 = threadTimestamps.get(testThreadTs);
			const timestamp2 = thread2?.last_message_time;

			expect(threadId1).toBe(threadId2);
			expect(timestamp2).toBeGreaterThan(timestamp1!);
		});
	});

	describe("getThreadByThreadId", () => {
		test("retrieves thread by thread ID", () => {
			const threadId = updateThreadTimestamp(testThreadTs, testChannelId);
			const thread = getThreadByThreadId(threadId);

			expect(thread).toBeDefined();
			expect(thread?.thread_ts).toBe(testThreadTs);
			expect(thread?.thread_id).toBe(threadId);
			expect(thread?.slack_channel_id).toBe(testChannelId);
		});

		test("returns null for non-existent thread ID", () => {
			const thread = getThreadByThreadId("xxxxx");
			expect(thread).toBeNull();
		});
	});
});
