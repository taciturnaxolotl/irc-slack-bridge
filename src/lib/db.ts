import { Database } from "bun:sqlite";

const db = new Database("bridge.db");

db.run(`
  CREATE TABLE IF NOT EXISTS channel_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_channel_id TEXT NOT NULL UNIQUE,
    irc_channel TEXT NOT NULL UNIQUE,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL UNIQUE,
    irc_nick TEXT NOT NULL UNIQUE,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// Migration: Add unique constraints if they don't exist
// SQLite doesn't support ALTER TABLE to add constraints, so we need to recreate the table
function migrateSchema() {
	// Check if irc_channel has unique constraint by examining table schema
	const channelSchema = db
		.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='channel_mappings'")
		.get() as { sql: string } | null;
	
	const hasIrcChannelUnique = channelSchema?.sql?.includes("irc_channel TEXT NOT NULL UNIQUE") ?? false;

	if (!hasIrcChannelUnique && channelSchema) {
		// Check if table has any data with duplicate irc_channel values
		const duplicates = db.query(
			"SELECT irc_channel, COUNT(*) as count FROM channel_mappings GROUP BY irc_channel HAVING count > 1",
		).all();

		if (duplicates.length > 0) {
			console.warn(
				"Warning: Found duplicate IRC channel mappings. Keeping only the most recent mapping for each IRC channel.",
			);
			for (const dup of duplicates as { irc_channel: string }[]) {
				// Delete all but the most recent mapping for this IRC channel
				db.run(
					`DELETE FROM channel_mappings 
					 WHERE irc_channel = ? 
					 AND id NOT IN (
					   SELECT id FROM channel_mappings 
					   WHERE irc_channel = ? 
					   ORDER BY created_at DESC 
					   LIMIT 1
					 )`,
					[dup.irc_channel, dup.irc_channel],
				);
			}
		}

		// Recreate the table with unique constraint
		db.run(`
			CREATE TABLE channel_mappings_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				slack_channel_id TEXT NOT NULL UNIQUE,
				irc_channel TEXT NOT NULL UNIQUE,
				created_at INTEGER DEFAULT (strftime('%s', 'now'))
			)
		`);

		db.run(
			"INSERT INTO channel_mappings_new SELECT * FROM channel_mappings",
		);
		db.run("DROP TABLE channel_mappings");
		db.run("ALTER TABLE channel_mappings_new RENAME TO channel_mappings");
		console.log("Migrated channel_mappings table to add unique constraint on irc_channel");
	}

	// Check if irc_nick has unique constraint by examining table schema
	const userSchema = db
		.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_mappings'")
		.get() as { sql: string } | null;
	
	const hasIrcNickUnique = userSchema?.sql?.includes("irc_nick TEXT NOT NULL UNIQUE") ?? false;

	if (!hasIrcNickUnique && userSchema) {
		// Check if table has any data with duplicate irc_nick values
		const duplicates = db.query(
			"SELECT irc_nick, COUNT(*) as count FROM user_mappings GROUP BY irc_nick HAVING count > 1",
		).all();

		if (duplicates.length > 0) {
			console.warn(
				"Warning: Found duplicate IRC nick mappings. Keeping only the most recent mapping for each IRC nick.",
			);
			for (const dup of duplicates as { irc_nick: string }[]) {
				// Delete all but the most recent mapping for this IRC nick
				db.run(
					`DELETE FROM user_mappings 
					 WHERE irc_nick = ? 
					 AND id NOT IN (
					   SELECT id FROM user_mappings 
					   WHERE irc_nick = ? 
					   ORDER BY created_at DESC 
					   LIMIT 1
					 )`,
					[dup.irc_nick, dup.irc_nick],
				);
			}
		}

		// Recreate the table with unique constraint
		db.run(`
			CREATE TABLE user_mappings_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				slack_user_id TEXT NOT NULL UNIQUE,
				irc_nick TEXT NOT NULL UNIQUE,
				created_at INTEGER DEFAULT (strftime('%s', 'now'))
			)
		`);

		db.run("INSERT INTO user_mappings_new SELECT * FROM user_mappings");
		db.run("DROP TABLE user_mappings");
		db.run("ALTER TABLE user_mappings_new RENAME TO user_mappings");
		console.log("Migrated user_mappings table to add unique constraint on irc_nick");
	}
}

migrateSchema();

db.run(`
  CREATE TABLE IF NOT EXISTS thread_timestamps (
    thread_ts TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL UNIQUE,
    slack_channel_id TEXT NOT NULL,
    last_message_time INTEGER NOT NULL
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_thread_id ON thread_timestamps(thread_id)
`);

export interface ChannelMapping {
	id?: number;
	slack_channel_id: string;
	irc_channel: string;
	created_at?: number;
}

export interface UserMapping {
	id?: number;
	slack_user_id: string;
	irc_nick: string;
	created_at?: number;
}

export const channelMappings = {
	getAll(): ChannelMapping[] {
		return db.query("SELECT * FROM channel_mappings").all() as ChannelMapping[];
	},

	getBySlackChannel(slackChannelId: string): ChannelMapping | null {
		return db
			.query("SELECT * FROM channel_mappings WHERE slack_channel_id = ?")
			.get(slackChannelId) as ChannelMapping | null;
	},

	getByIrcChannel(ircChannel: string): ChannelMapping | null {
		return db
			.query("SELECT * FROM channel_mappings WHERE irc_channel = ?")
			.get(ircChannel) as ChannelMapping | null;
	},

	create(slackChannelId: string, ircChannel: string): void {
		db.run(
			"INSERT OR REPLACE INTO channel_mappings (slack_channel_id, irc_channel) VALUES (?, ?)",
			[slackChannelId, ircChannel],
		);
	},

	delete(slackChannelId: string): void {
		db.run("DELETE FROM channel_mappings WHERE slack_channel_id = ?", [
			slackChannelId,
		]);
	},
};

export const userMappings = {
	getAll(): UserMapping[] {
		return db.query("SELECT * FROM user_mappings").all() as UserMapping[];
	},

	getBySlackUser(slackUserId: string): UserMapping | null {
		return db
			.query("SELECT * FROM user_mappings WHERE slack_user_id = ?")
			.get(slackUserId) as UserMapping | null;
	},

	getByIrcNick(ircNick: string): UserMapping | null {
		return db
			.query("SELECT * FROM user_mappings WHERE irc_nick = ?")
			.get(ircNick) as UserMapping | null;
	},

	create(slackUserId: string, ircNick: string): void {
		db.run(
			"INSERT OR REPLACE INTO user_mappings (slack_user_id, irc_nick) VALUES (?, ?)",
			[slackUserId, ircNick],
		);
	},

	delete(slackUserId: string): void {
		db.run("DELETE FROM user_mappings WHERE slack_user_id = ?", [slackUserId]);
	},
};

export interface ThreadInfo {
	thread_ts: string;
	thread_id: string;
	slack_channel_id: string;
	last_message_time: number;
}

export const threadTimestamps = {
	get(threadTs: string): ThreadInfo | null {
		return db
			.query("SELECT * FROM thread_timestamps WHERE thread_ts = ?")
			.get(threadTs) as ThreadInfo | null;
	},

	getByThreadId(threadId: string): ThreadInfo | null {
		return db
			.query("SELECT * FROM thread_timestamps WHERE thread_id = ?")
			.get(threadId) as ThreadInfo | null;
	},

	update(
		threadTs: string,
		threadId: string,
		slackChannelId: string,
		timestamp: number,
	): void {
		db.run(
			"INSERT OR REPLACE INTO thread_timestamps (thread_ts, thread_id, slack_channel_id, last_message_time) VALUES (?, ?, ?, ?)",
			[threadTs, threadId, slackChannelId, timestamp],
		);
	},

	cleanup(olderThan: number): void {
		db.run("DELETE FROM thread_timestamps WHERE last_message_time < ?", [
			olderThan,
		]);
	},
};

export default db;
