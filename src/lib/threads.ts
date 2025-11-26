import { threadTimestamps } from "./db";

const THREAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a short 5-character thread ID from thread_ts
 */
export function generateThreadId(threadTs: string): string {
	let hash = 0;
	for (let i = 0; i < threadTs.length; i++) {
		hash = (hash << 5) - hash + threadTs.charCodeAt(i);
		hash = hash & hash;
	}
	// Convert to base36 and take first 5 characters
	return Math.abs(hash).toString(36).substring(0, 5);
}

/**
 * Check if this is the first message in a thread (thread doesn't exist in DB yet)
 */
export function isFirstThreadMessage(threadTs: string): boolean {
	const thread = threadTimestamps.get(threadTs);
	return !thread;
}

/**
 * Get thread info by thread ID
 */
export function getThreadByThreadId(threadId: string) {
	return threadTimestamps.getByThreadId(threadId);
}

/**
 * Update the last message time for a thread
 */
export function updateThreadTimestamp(
	threadTs: string,
	slackChannelId: string,
): string {
	const threadId = generateThreadId(threadTs);
	threadTimestamps.update(threadTs, threadId, slackChannelId, Date.now());
	return threadId;
}

/**
 * Clean up old thread entries (optional, for memory management)
 */
export function cleanupOldThreads(): void {
	const cutoff = Date.now() - THREAD_TIMEOUT_MS * 2;
	threadTimestamps.cleanup(cutoff);
}
