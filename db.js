const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

class DbWrapper {
  constructor(dbPath) {
    this._db = new DatabaseSync(dbPath);
  }

  exec(sql) {
    this._db.exec(sql);
  }

  prepare(sql) {
    const stmt = this._db.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params),
    };
  }

  transaction(fn) {
    return (...args) => {
      this._db.exec('BEGIN IMMEDIATE');
      try {
        fn(...args);
        this._db.exec('COMMIT');
      } catch (err) {
        this._db.exec('ROLLBACK');
        throw err;
      }
    };
  }
}

const db = new DbWrapper(path.join(dataDir, 'prices.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_set_id TEXT NOT NULL,
    card_name TEXT,
    rarity TEXT,
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS price_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_set_id TEXT NOT NULL,
    source TEXT NOT NULL,
    variant_name TEXT,
    price_original REAL NOT NULL,
    currency TEXT NOT NULL,
    price_idr REAL NOT NULL,
    url TEXT,
    fetched_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exchange_rates (
    currency TEXT PRIMARY KEY,
    rate_to_idr REAL NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_price_entries_card ON price_entries(card_set_id);
  CREATE INDEX IF NOT EXISTS idx_price_entries_source ON price_entries(source, card_set_id);
`);

const seedFacebook = db.prepare('SELECT COUNT(*) as count FROM price_entries WHERE source = ?');
if (seedFacebook.get('facebook').count === 0) {
  const insert = db.prepare(`
    INSERT INTO price_entries (card_set_id, source, variant_name, price_original, currency, price_idr, url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const samples = [
    ['OP01-001', 'facebook', 'Leader (L)', 25000, 'IDR', 25000, 'Forum One Piece TCG Indonesia'],
    ['OP01-001', 'facebook', 'Leader Parallel', 450000, 'IDR', 450000, 'Forum One Piece TCG Indonesia'],
    ['OP05-067', 'facebook', 'Manga Rare', 8500000, 'IDR', 8500000, 'Forum One Piece TCG Indonesia'],
    ['OP09-001', 'facebook', 'Leader (L)', 180000, 'IDR', 180000, 'Forum One Piece TCG Indonesia'],
  ];

  const tx = db.transaction((rows) => {
    for (const row of rows) insert.run(...row);
  });
  tx(samples);
}

module.exports = db;
