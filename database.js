// ============================================
// Cultiv8 — Database Layer (sql.js)
// ============================================
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

let db = null;

const DB_PATH = process.env.DB_PATH || "./cultiv8.db";

async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log("📦 Loaded existing database");
  } else {
    db = new SQL.Database();
    console.log("📦 Created new database");
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      location TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      provider TEXT DEFAULT 'local',
      password_hash TEXT,
      google_picture TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS farms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size REAL NOT NULL,
      crop TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      practices TEXT NOT NULL DEFAULT '[]',
      total_carbon REAL DEFAULT 0,
      breakdown TEXT DEFAULT '[]',
      ndvi REAL DEFAULT 0,
      soc REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      crop TEXT NOT NULL,
      qty REAL NOT NULL,
      method TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      weather TEXT DEFAULT '{}',
      spoilage TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      color TEXT DEFAULT 'gn',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'warn',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS carbon_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      farm_id INTEGER NOT NULL,
      buyer_name TEXT NOT NULL,
      tonnes REAL NOT NULL,
      price_per_tonne REAL NOT NULL,
      total_ngn REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS buyer_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      storage_id INTEGER NOT NULL,
      buyer_name TEXT NOT NULL,
      buyer_type TEXT NOT NULL,
      status TEXT DEFAULT 'contacted',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (storage_id) REFERENCES storage(id) ON DELETE CASCADE
    )
  `);

  // Indexes
  db.run("CREATE INDEX IF NOT EXISTS idx_farms_user ON farms(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_storage_user ON storage(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)");

  saveDB();
  console.log("✅ Database tables initialized");
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDB() {
  return db;
}

// Helper: run query and return rows as objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runSQL(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

module.exports = { initDB, getDB, saveDB, queryAll, queryOne, runSQL };
