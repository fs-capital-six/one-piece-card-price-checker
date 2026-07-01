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
    login_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS monitored_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_url TEXT NOT NULL,
    post_title TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id);
  CREATE INDEX IF NOT EXISTS idx_monitored_posts_user ON monitored_posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_monitored_posts_status ON monitored_posts(user_id, status);
`);

function ensureUserColumns() {
  const columns = db.prepare('PRAGMA table_info(users)').all().map((col) => col.name);
  if (!columns.includes('login_count')) {
    db.exec('ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.includes('updated_at')) {
    db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))");
  }
}

ensureUserColumns();

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    facebookId: row.facebook_id,
    name: row.name,
    email: row.email,
    pictureUrl: row.picture_url,
    loginCount: row.login_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function upsertUser({ facebookId, name, email, pictureUrl }) {
  const existing = db.prepare('SELECT id FROM users WHERE facebook_id = ?').get(facebookId);

  if (existing) {
    db.prepare(`
      UPDATE users
      SET
        name = ?,
        email = ?,
        picture_url = ?,
        login_count = login_count + 1,
        updated_at = datetime('now'),
        last_login_at = datetime('now')
      WHERE facebook_id = ?
    `).run(name, email || null, pictureUrl || null, facebookId);

    const row = db.prepare(`
      SELECT id, facebook_id, name, email, picture_url, login_count, created_at, updated_at, last_login_at
      FROM users WHERE facebook_id = ?
    `).get(facebookId);

    return { user: mapUser(row), isNewUser: false };
  }

  const result = db.prepare(`
    INSERT INTO users (facebook_id, name, email, picture_url, login_count)
    VALUES (?, ?, ?, ?, 1)
  `).run(facebookId, name, email || null, pictureUrl || null);

  const row = db.prepare(`
    SELECT id, facebook_id, name, email, picture_url, login_count, created_at, updated_at, last_login_at
    FROM users WHERE id = ?
  `).get(result.lastInsertRowid);

  return { user: mapUser(row), isNewUser: true };
}

function findUserById(id) {
  const row = db.prepare(`
    SELECT id, facebook_id, name, email, picture_url, login_count, created_at, updated_at, last_login_at
    FROM users WHERE id = ?
  `).get(id);
  return mapUser(row);
}

function findUserByFacebookId(facebookId) {
  const row = db.prepare(`
    SELECT id, facebook_id, name, email, picture_url, login_count, created_at, updated_at, last_login_at
    FROM users WHERE facebook_id = ?
  `).get(facebookId);
  return mapUser(row);
}

function mapMonitoredPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    postUrl: row.post_url,
    postTitle: row.post_title,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeFacebookPostUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) {
    throw new Error('Link posting wajib diisi');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Format link tidak valid');
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const allowedHosts = ['facebook.com', 'm.facebook.com', 'fb.com', 'fb.watch'];
  const isAllowed = allowedHosts.some((allowed) => host === allowed || host.endsWith('.facebook.com'));

  if (!isAllowed) {
    throw new Error('Link harus dari Facebook (facebook.com / fb.com)');
  }

  parsed.hash = '';
  return parsed.toString();
}

function listMonitoredPostsByUserId(userId) {
  return db
    .prepare(`
      SELECT id, user_id, post_url, post_title, status, notes, created_at, updated_at
      FROM monitored_posts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId)
    .map(mapMonitoredPost);
}

function findMonitoredPostById(id) {
  const row = db.prepare(`
    SELECT id, user_id, post_url, post_title, status, notes, created_at, updated_at
    FROM monitored_posts
    WHERE id = ?
  `).get(id);
  return mapMonitoredPost(row);
}

function createMonitoredPost({ userId, postUrl, postTitle, notes }) {
  const normalizedUrl = normalizeFacebookPostUrl(postUrl);
  const title = String(postTitle || '').trim() || null;
  const noteText = String(notes || '').trim() || null;

  const result = db.prepare(`
    INSERT INTO monitored_posts (user_id, post_url, post_title, notes)
    VALUES (?, ?, ?, ?)
  `).run(userId, normalizedUrl, title, noteText);

  return findMonitoredPostById(result.lastInsertRowid);
}

function deleteMonitoredPost({ id, userId }) {
  const existing = findMonitoredPostById(id);
  if (!existing || existing.userId !== userId) {
    return false;
  }

  db.prepare('DELETE FROM monitored_posts WHERE id = ? AND user_id = ?').run(id, userId);
  return true;
}

function updateMonitoredPostStatus({ id, userId, status }) {
  const allowed = new Set(['active', 'closed', 'cancelled']);
  if (!allowed.has(status)) {
    throw new Error('Status tidak valid');
  }

  const existing = findMonitoredPostById(id);
  if (!existing || existing.userId !== userId) {
    return null;
  }

  db.prepare(`
    UPDATE monitored_posts
    SET status = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(status, id, userId);

  return findMonitoredPostById(id);
}

module.exports = {
  upsertUser,
  findUserById,
  findUserByFacebookId,
  listMonitoredPostsByUserId,
  createMonitoredPost,
  deleteMonitoredPost,
  updateMonitoredPostStatus,
  normalizeFacebookPostUrl,
};
