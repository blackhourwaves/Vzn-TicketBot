const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'vzn-ticket.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    category_key TEXT NOT NULL,
    category_label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    closed_at TEXT,
    closed_by TEXT,
    claimed_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_owner_status
  ON tickets(guild_id, owner_id, status);

  CREATE TABLE IF NOT EXISTS ticket_members (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (channel_id, user_id),
    FOREIGN KEY (channel_id) REFERENCES tickets(channel_id) ON DELETE CASCADE
  );
`);

module.exports = db;
