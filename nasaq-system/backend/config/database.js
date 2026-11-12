// SQLite connection + schema. Swap for MySQL/PostgreSQL later by re-implementing models/.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'nasaq.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('doctor','supervisor')),
  full_name        TEXT NOT NULL,
  department       TEXT NOT NULL,
  title            TEXT,
  qualifications   TEXT,
  certifications   TEXT DEFAULT '',          -- comma separated: BLS,ACLS,...
  experience_years INTEGER DEFAULT 0,
  supervisor_id    INTEGER REFERENCES users(id),
  willing_overtime INTEGER DEFAULT 0,
  max_weekly_hours INTEGER DEFAULT 48,
  email            TEXT,
  phone            TEXT,
  theme            TEXT DEFAULT 'light',
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shifts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id          INTEGER REFERENCES users(id),      -- NULL = open shift
  original_doctor_id INTEGER REFERENCES users(id),      -- set when shift was reassigned
  supervisor_id      INTEGER NOT NULL REFERENCES users(id),
  date               TEXT NOT NULL,                     -- YYYY-MM-DD
  start_time         TEXT NOT NULL,                     -- HH:MM
  end_time           TEXT NOT NULL,                     -- HH:MM (may pass midnight)
  shift_type         TEXT NOT NULL,                     -- Morning / Evening / Night
  hours              REAL NOT NULL,
  department         TEXT NOT NULL,
  required_cert      TEXT,
  status             TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','open')),
  offered            INTEGER DEFAULT 0,                 -- doctor put it up for swap
  attendance         TEXT DEFAULT 'pending' CHECK (attendance IN ('pending','present','absent','late'))
);

CREATE TABLE IF NOT EXISTS requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id       INTEGER NOT NULL REFERENCES users(id),
  supervisor_id   INTEGER NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN ('swap','leave','coverage')),
  shift_id        INTEGER REFERENCES shifts(id),
  start_date      TEXT,
  end_date        TEXT,
  leave_type      TEXT,                                  -- Sick / Vacation / Emergency / Training
  reason          TEXT NOT NULL,
  attachment_path TEXT,
  attachment_name TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  replacement_id  INTEGER REFERENCES users(id),
  supervisor_note TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  decided_at      TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  message    TEXT NOT NULL,
  link       TEXT,
  is_read    INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  supervisor_id INTEGER NOT NULL REFERENCES users(id),
  doctor_id     INTEGER NOT NULL REFERENCES users(id),
  period        TEXT NOT NULL,                           -- YYYY-MM
  rating        INTEGER,                                 -- 1..5
  content       TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shifts_doctor_date ON shifts(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_shifts_sup_date ON shifts(supervisor_id, date);
CREATE INDEX IF NOT EXISTS idx_requests_sup ON requests(supervisor_id, status);
`);

module.exports = db;
