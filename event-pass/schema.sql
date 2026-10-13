-- Event Pass database (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS tickets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  token            TEXT    NOT NULL UNIQUE,          -- secret, encoded in the QR
  code             TEXT    NOT NULL UNIQUE,          -- short human code for manual lookup
  order_id         TEXT    UNIQUE,                   -- from the purchase flow; makes the webhook idempotent
  buyer_name       TEXT    NOT NULL,
  buyer_email      TEXT,
  buyer_phone      TEXT,
  guest_name       TEXT,
  admits           INTEGER NOT NULL DEFAULT 2,       -- one pass = one pair
  admitted         INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'active', -- active | void
  source           TEXT,                             -- webhook | manual | import
  created_at       TEXT    NOT NULL,
  first_checkin_at TEXT,
  last_checkin_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets (buyer_email COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS checkins (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets (id),
  delta     INTEGER NOT NULL,                        -- +1/+2 admit, -1 undo
  door      TEXT,
  at        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkins_ticket ON checkins (ticket_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Wrong-PIN / wrong-secret throttle, per client IP
CREATE TABLE IF NOT EXISTS auth_failures (
  ip           TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
