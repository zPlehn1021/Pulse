-- 001_initial.sql
-- Initial schema for PULSE prediction market dashboard

CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  question TEXT NOT NULL,
  category TEXT NOT NULL,
  yes_price REAL NOT NULL,
  volume_24h REAL DEFAULT 0,
  liquidity REAL DEFAULT 0,
  last_updated TEXT NOT NULL,
  source_url TEXT NOT NULL,
  resolution TEXT
);

CREATE INDEX IF NOT EXISTS idx_markets_platform ON markets(platform);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume_24h DESC);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  composite_score REAL,
  composite_certainty REAL,
  composite_conviction REAL,
  total_markets INTEGER
);

CREATE TABLE IF NOT EXISTS category_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER REFERENCES snapshots(id),
  category TEXT NOT NULL,
  score REAL,
  uncertainty REAL,
  conviction REAL,
  market_count INTEGER,
  platform_breakdown TEXT
);

CREATE TABLE IF NOT EXISTS divergence_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER REFERENCES snapshots(id),
  category TEXT,
  question TEXT,
  spread REAL,
  high_platform TEXT,
  high_price REAL,
  low_platform TEXT,
  low_price REAL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_cat_snap ON category_snapshots(snapshot_id);
