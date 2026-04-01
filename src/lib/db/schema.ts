export const SCHEMA = `
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
  resolution TEXT,
  sentiment_direction TEXT,
  classified_at TEXT
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
  spread REAL,
  high_platform TEXT,
  high_score REAL,
  low_platform TEXT,
  low_score REAL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_cat_snap ON category_snapshots(snapshot_id);

-- Per-market price snapshots for momentum / volatility calculation
CREATE TABLE IF NOT EXISTS market_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  category TEXT NOT NULL,
  yes_price REAL NOT NULL,
  volume_24h REAL DEFAULT 0,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mp_market ON market_prices(market_id);
CREATE INDEX IF NOT EXISTS idx_mp_recorded ON market_prices(recorded_at);
CREATE INDEX IF NOT EXISTS idx_mp_category ON market_prices(category);

-- AI-generated narrative cache
CREATE TABLE IF NOT EXISTS narratives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER REFERENCES snapshots(id),
  category TEXT,
  narrative TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_narratives_snap ON narratives(snapshot_id);

-- External signal readings (FRED, Google Trends, computed composites)
CREATE TABLE IF NOT EXISTS signal_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_source TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  signal_name TEXT NOT NULL,
  category TEXT,
  value REAL NOT NULL,
  previous_value REAL,
  unit TEXT,
  recorded_at TEXT NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_signals_source ON signal_readings(signal_source);
CREATE INDEX IF NOT EXISTS idx_signals_id ON signal_readings(signal_id);
CREATE INDEX IF NOT EXISTS idx_signals_recorded ON signal_readings(recorded_at);
CREATE INDEX IF NOT EXISTS idx_signals_category ON signal_readings(category);

-- AI-curated attention terms (Google Trends)
CREATE TABLE IF NOT EXISTS attention_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  category TEXT NOT NULL,
  generated_reason TEXT,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  trend_value REAL,
  trend_fetched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_attention_category ON attention_terms(category);
CREATE INDEX IF NOT EXISTS idx_attention_expires ON attention_terms(expires_at);

-- Resolution records: what every signal said vs. what actually happened
CREATE TABLE IF NOT EXISTS resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- What resolved
  market_id TEXT,
  event_type TEXT NOT NULL,
  event_description TEXT NOT NULL,
  category TEXT NOT NULL,

  -- What actually happened
  outcome TEXT NOT NULL,
  resolved_at TEXT NOT NULL,

  -- Signal snapshots at key intervals before resolution (JSON blobs)
  signals_30d TEXT,
  signals_7d TEXT,
  signals_1d TEXT,
  signals_at_resolution TEXT,

  -- Scoring
  prediction_market_correct INTEGER,
  pm_confidence_at_close REAL,
  consumer_sentiment_direction TEXT,
  fear_signals_direction TEXT,
  attention_level TEXT,

  -- AI retrospective
  ai_retrospective TEXT,

  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resolutions_category ON resolutions(category);
CREATE INDEX IF NOT EXISTS idx_resolutions_type ON resolutions(event_type);
CREATE INDEX IF NOT EXISTS idx_resolutions_date ON resolutions(resolved_at);
CREATE INDEX IF NOT EXISTS idx_resolutions_market ON resolutions(market_id);
`;
