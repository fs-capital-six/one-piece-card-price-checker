const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'auth.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facebook_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    picture_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id);
`);

function upsertUser({ facebookId, name, email, pictureUrl }) {
  const existing = db.prepare('SELECT id FROM users WHERE facebook_id = ?').get(facebookId);

  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, picture_url = ?, last_login_at = datetime('now')
      WHERE facebook_id = ?
    `).run(name, email || null, pictureUrl || null, facebookId);

    return db.prepare('SELECT id, facebook_id, name, email, picture_url FROM users WHERE facebook_id = ?').get(facebookId);
  }

  const result = db.prepare(`
    INSERT INTO users (facebook_id, name, email, picture_url)
    VALUES (?, ?, ?, ?)
  `).run(facebookId, name, email || null, pictureUrl || null);

  return db.prepare('SELECT id, facebook_id, name, email, picture_url FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function findUserById(id) {
  return db.prepare('SELECT id, facebook_id, name, email, picture_url FROM users WHERE id = ?').get(id);
}

module.exports = { upsertUser, findUserById };
