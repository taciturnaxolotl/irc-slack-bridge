import { Database } from "bun:sqlite";

const db = new Database("bridge.db");

db.run(`
  CREATE TABLE IF NOT EXISTS channel_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_channel_id TEXT NOT NULL UNIQUE,
    irc_channel TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL UNIQUE,
    irc_nick TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
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

export default db;
