import Database from "better-sqlite3";
import path from "path";
import { SCHEMA } from "./schema";
import type {
  NormalizedMarket,
  CompositeIndex,
  CategoryAnalysis,
  CategoryId,
  Divergence,
  Platform,
} from "@/lib/platforms/types";

const DB_PATH = process.env.DATABASE_PATH || "./data/pulse.db";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = path.resolve(DB_PATH);
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.exec(SCHEMA);
    runMigrations(_db);
  }
  return _db;
}

/**
 * Run incremental migrations for schema changes that ALTER existing tables.
 * Each migration checks if it's already been applied before running.
 */
function runMigrations(db: Database.Database): void {
  // v2 Phase 1: Add sentiment_direction columns to markets table
  const columns = db.prepare("PRAGMA table_info(markets)").all() as { name: string }[];
  const columnNames = columns.map((c) => c.name);

  if (!columnNames.includes("sentiment_direction")) {
    db.exec("ALTER TABLE markets ADD COLUMN sentiment_direction TEXT");
  }
  if (!columnNames.includes("classified_at")) {
    db.exec("ALTER TABLE markets ADD COLUMN classified_at TEXT");
  }
  if (!columnNames.includes("close_date")) {
    db.exec("ALTER TABLE markets ADD COLUMN close_date TEXT");
  }
}

// ---------------------------------------------------------------------------
// Markets (current state)
// ---------------------------------------------------------------------------

export function upsertMarkets(markets: NormalizedMarket[]): void {
  const db = getDb();
  // Use INSERT ... ON CONFLICT to preserve sentiment_direction/classified_at
  // that were set by the classifier (adapters don't provide these fields)
  const stmt = db.prepare(`
    INSERT INTO markets
      (id, platform, question, category, yes_price,
       volume_24h, liquidity, last_updated, source_url, resolution, close_date)
    VALUES
      (@id, @platform, @question, @category, @yesPrice,
       @volume24h, @liquidity, @lastUpdated, @sourceUrl, @resolution, @closeDate)
    ON CONFLICT(id) DO UPDATE SET
      platform = excluded.platform,
      question = excluded.question,
      category = excluded.category,
      yes_price = excluded.yes_price,
      volume_24h = excluded.volume_24h,
      liquidity = excluded.liquidity,
      last_updated = excluded.last_updated,
      source_url = excluded.source_url,
      resolution = excluded.resolution,
      close_date = excluded.close_date
  `);

  const upsertMany = db.transaction((items: NormalizedMarket[]) => {
    for (const m of items) {
      stmt.run({
        id: m.id,
        platform: m.platform,
        question: m.question,
        category: m.category,
        yesPrice: m.yesPrice,
        volume24h: m.volume24h,
        liquidity: m.liquidity,
        lastUpdated: m.lastUpdated.toISOString(),
        sourceUrl: m.sourceUrl,
        resolution: m.resolution ?? null,
        closeDate: m.closeDate ? m.closeDate.toISOString() : null,
      });
    }
  });

  upsertMany(markets);
}

export function getMarkets(platform?: string): NormalizedMarket[] {
  const db = getDb();
  const query = platform
    ? "SELECT * FROM markets WHERE platform = ? ORDER BY volume_24h DESC"
    : "SELECT * FROM markets ORDER BY volume_24h DESC";

  const rows = platform
    ? db.prepare(query).all(platform)
    : db.prepare(query).all();

  return (rows as Record<string, unknown>[]).map(hydrateMarketRow);
}

function hydrateMarketRow(row: Record<string, unknown>): NormalizedMarket {
  return {
    id: row.id as string,
    platform: row.platform as NormalizedMarket["platform"],
    question: row.question as string,
    category: row.category as NormalizedMarket["category"],
    yesPrice: row.yes_price as number,
    volume24h: row.volume_24h as number,
    liquidity: row.liquidity as number,
    lastUpdated: new Date(row.last_updated as string),
    sourceUrl: row.source_url as string,
    resolution: (row.resolution as "yes" | "no" | null) ?? undefined,
    closeDate: row.close_date ? new Date(row.close_date as string) : null,
  };
}

// ---------------------------------------------------------------------------
// Sentiment direction classification
// ---------------------------------------------------------------------------

export type SentimentDirection = "positive" | "negative" | "neutral";

/**
 * Get markets that haven't been classified for sentiment direction yet.
 * Only returns non-resolved, non-feargreed markets.
 */
export function getUnclassifiedMarkets(): { id: string; question: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, question FROM markets
       WHERE sentiment_direction IS NULL
         AND platform != 'feargreed'
         AND resolution IS NULL
       ORDER BY volume_24h DESC`,
    )
    .all() as { id: string; question: string }[];
}

/**
 * Save sentiment direction classifications for a batch of markets.
 */
export function saveSentimentClassifications(
  classifications: { id: string; direction: SentimentDirection }[],
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE markets SET sentiment_direction = ?, classified_at = ? WHERE id = ?`,
  );
  const updateMany = db.transaction(
    (items: { id: string; direction: SentimentDirection }[]) => {
      for (const item of items) {
        stmt.run(item.direction, now, item.id);
      }
    },
  );
  updateMany(classifications);
}

/**
 * Get sentiment direction for a market by ID.
 */
export function getMarketSentimentDirection(
  marketId: string,
): SentimentDirection | null {
  const db = getDb();
  const row = db
    .prepare("SELECT sentiment_direction FROM markets WHERE id = ?")
    .get(marketId) as { sentiment_direction: string | null } | undefined;
  return (row?.sentiment_direction as SentimentDirection) ?? null;
}

/**
 * Batch-fetch sentiment directions for all markets in a category.
 */
export function getCategorySentimentDirections(
  category: CategoryId,
): Map<string, SentimentDirection> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, sentiment_direction FROM markets
       WHERE category = ? AND sentiment_direction IS NOT NULL`,
    )
    .all(category) as { id: string; sentiment_direction: string }[];

  const result = new Map<string, SentimentDirection>();
  for (const row of rows) {
    result.set(row.id, row.sentiment_direction as SentimentDirection);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Market price history (per-market snapshots for momentum/volatility)
// ---------------------------------------------------------------------------

export function saveMarketPrices(markets: NormalizedMarket[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO market_prices (market_id, platform, category, yes_price, volume_24h, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: NormalizedMarket[]) => {
    for (const m of items) {
      stmt.run(m.id, m.platform, m.category, m.yesPrice, m.volume24h, now);
    }
  });

  insertMany(markets);
}

/**
 * Get the price of a market at approximately `hoursAgo` hours in the past.
 * Returns null if no history exists that far back.
 */
export function getMarketPriceAt(
  marketId: string,
  hoursAgo: number,
): number | null {
  const db = getDb();
  const targetTime = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000,
  ).toISOString();

  const row = db
    .prepare(
      `SELECT yes_price FROM market_prices
       WHERE market_id = ? AND recorded_at <= ?
       ORDER BY recorded_at DESC LIMIT 1`,
    )
    .get(marketId, targetTime) as { yes_price: number } | undefined;

  return row?.yes_price ?? null;
}

/**
 * Get all price samples for a market in the last N hours.
 * Used for volatility calculation.
 */
export function getMarketPriceHistory(
  marketId: string,
  hours: number,
): number[] {
  const db = getDb();
  const since = new Date(
    Date.now() - hours * 60 * 60 * 1000,
  ).toISOString();

  const rows = db
    .prepare(
      `SELECT yes_price FROM market_prices
       WHERE market_id = ? AND recorded_at >= ?
       ORDER BY recorded_at ASC`,
    )
    .all(marketId, since) as { yes_price: number }[];

  return rows.map((r) => r.yes_price);
}

/**
 * Batch-fetch price deltas for all markets in a category.
 * Returns a map: marketId → { price1h, price6h, price24h, prices24h[] }
 */
export function getCategoryPriceDeltas(
  category: CategoryId,
): Map<
  string,
  {
    price5m: number | null;
    price1h: number | null;
    price6h: number | null;
    price24h: number | null;
    prices24h: number[];
  }
> {
  const db = getDb();
  const result = new Map<
    string,
    {
      price5m: number | null;
      price1h: number | null;
      price6h: number | null;
      price24h: number | null;
      prices24h: number[];
    }
  >();

  const now = Date.now();
  const t5m = new Date(now - 5 * 60 * 1000).toISOString();
  const t1h = new Date(now - 1 * 60 * 60 * 1000).toISOString();
  const t6h = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const t24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Get all market IDs in this category
  const marketIds = db
    .prepare("SELECT id FROM markets WHERE category = ?")
    .all(category) as { id: string }[];

  for (const { id } of marketIds) {
    const getPrice = (since: string) => {
      const row = db
        .prepare(
          `SELECT yes_price FROM market_prices
           WHERE market_id = ? AND recorded_at <= ?
           ORDER BY recorded_at DESC LIMIT 1`,
        )
        .get(id, since) as { yes_price: number } | undefined;
      return row?.yes_price ?? null;
    };

    const allPrices = db
      .prepare(
        `SELECT yes_price FROM market_prices
         WHERE market_id = ? AND recorded_at >= ?
         ORDER BY recorded_at ASC`,
      )
      .all(id, t24h) as { yes_price: number }[];

    result.set(id, {
      price5m: getPrice(t5m),
      price1h: getPrice(t1h),
      price6h: getPrice(t6h),
      price24h: getPrice(t24h),
      prices24h: allPrices.map((r) => r.yes_price),
    });
  }

  return result;
}

/**
 * Prune old price data to keep DB size manageable.
 * Keeps 48 hours of per-market data.
 */
export function pruneOldPrices(hoursToKeep = 48): void {
  const db = getDb();
  const cutoff = new Date(
    Date.now() - hoursToKeep * 60 * 60 * 1000,
  ).toISOString();
  db.prepare("DELETE FROM market_prices WHERE recorded_at < ?").run(cutoff);
}

// ---------------------------------------------------------------------------
// Signal readings (FRED, Google Trends, computed composites)
// ---------------------------------------------------------------------------

export interface SignalReading {
  signalSource: string;
  signalId: string;
  signalName: string;
  category: string | null;
  value: number;
  previousValue: number | null;
  unit: string | null;
  recordedAt: string;
  metadata: Record<string, unknown> | null;
}

/**
 * Save a batch of signal readings.
 */
export function saveSignalReadings(readings: SignalReading[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO signal_readings
      (signal_source, signal_id, signal_name, category, value,
       previous_value, unit, recorded_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items: SignalReading[]) => {
    for (const r of items) {
      stmt.run(
        r.signalSource,
        r.signalId,
        r.signalName,
        r.category,
        r.value,
        r.previousValue,
        r.unit,
        r.recordedAt,
        r.metadata ? JSON.stringify(r.metadata) : null,
      );
    }
  });
  insertMany(readings);
}

/**
 * Get the latest reading for a specific signal.
 */
export function getLatestSignalReading(
  signalId: string,
): SignalReading | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM signal_readings
       WHERE signal_id = ?
       ORDER BY recorded_at DESC LIMIT 1`,
    )
    .get(signalId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return hydrateSignalRow(row);
}

/**
 * Get the latest readings for all signals from a given source.
 */
export function getLatestSignalsBySource(
  source: string,
): SignalReading[] {
  const db = getDb();
  // Get the most recent reading per signal_id for this source
  const rows = db
    .prepare(
      `SELECT sr.* FROM signal_readings sr
       INNER JOIN (
         SELECT signal_id, MAX(recorded_at) as max_recorded
         FROM signal_readings
         WHERE signal_source = ?
         GROUP BY signal_id
       ) latest ON sr.signal_id = latest.signal_id
         AND sr.recorded_at = latest.max_recorded
       WHERE sr.signal_source = ?`,
    )
    .all(source, source) as Record<string, unknown>[];
  return rows.map(hydrateSignalRow);
}

/**
 * Get the age of the latest reading for a signal source (ms since last reading).
 */
export function getSignalSourceAge(source: string): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(recorded_at) as latest FROM signal_readings WHERE signal_source = ?`,
    )
    .get(source) as { latest: string | null } | undefined;
  if (!row?.latest) return null;
  return Date.now() - new Date(row.latest).getTime();
}

/**
 * Get all latest signal readings across all sources.
 */
export function getAllLatestSignals(): SignalReading[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT sr.* FROM signal_readings sr
       INNER JOIN (
         SELECT signal_id, MAX(recorded_at) as max_recorded
         FROM signal_readings
         GROUP BY signal_id
       ) latest ON sr.signal_id = latest.signal_id
         AND sr.recorded_at = latest.max_recorded`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(hydrateSignalRow);
}

function hydrateSignalRow(row: Record<string, unknown>): SignalReading {
  return {
    signalSource: row.signal_source as string,
    signalId: row.signal_id as string,
    signalName: row.signal_name as string,
    category: (row.category as string) ?? null,
    value: row.value as number,
    previousValue: (row.previous_value as number) ?? null,
    unit: (row.unit as string) ?? null,
    recordedAt: row.recorded_at as string,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  };
}

// ---------------------------------------------------------------------------
// Attention terms (AI-curated Google Trends)
// ---------------------------------------------------------------------------

export interface AttentionTerm {
  id?: number;
  term: string;
  category: string;
  generatedReason: string | null;
  generatedAt: string;
  expiresAt: string;
  trendValue: number | null;
  trendFetchedAt: string | null;
}

/**
 * Save a batch of AI-curated attention terms.
 */
export function saveAttentionTerms(terms: AttentionTerm[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO attention_terms
      (term, category, generated_reason, generated_at, expires_at, trend_value, trend_fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items: AttentionTerm[]) => {
    for (const t of items) {
      stmt.run(
        t.term,
        t.category,
        t.generatedReason,
        t.generatedAt,
        t.expiresAt,
        t.trendValue,
        t.trendFetchedAt,
      );
    }
  });
  insertMany(terms);
}

/**
 * Get active (non-expired) attention terms.
 */
export function getActiveAttentionTerms(): AttentionTerm[] {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT * FROM attention_terms
       WHERE expires_at > ?
       ORDER BY generated_at DESC`,
    )
    .all(now) as Record<string, unknown>[];
  return rows.map(hydrateAttentionRow);
}

/**
 * Get the latest batch of attention terms (regardless of expiration).
 */
export function getLatestAttentionTerms(): AttentionTerm[] {
  const db = getDb();
  // Get the most recent generated_at and return all terms from that batch
  const latestRow = db
    .prepare(
      `SELECT generated_at FROM attention_terms ORDER BY generated_at DESC LIMIT 1`,
    )
    .get() as { generated_at: string } | undefined;
  if (!latestRow) return [];

  const rows = db
    .prepare(`SELECT * FROM attention_terms WHERE generated_at = ?`)
    .all(latestRow.generated_at) as Record<string, unknown>[];
  return rows.map(hydrateAttentionRow);
}

/**
 * Update trend values for attention terms by ID.
 */
export function updateAttentionTrendValues(
  updates: { id: number; trendValue: number }[],
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE attention_terms SET trend_value = ?, trend_fetched_at = ? WHERE id = ?`,
  );
  const updateMany = db.transaction(
    (items: { id: number; trendValue: number }[]) => {
      for (const item of items) {
        stmt.run(item.trendValue, now, item.id);
      }
    },
  );
  updateMany(updates);
}

/**
 * Get the age of the latest attention term generation (ms).
 */
export function getAttentionTermsAge(): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(generated_at) as latest FROM attention_terms`,
    )
    .get() as { latest: string | null } | undefined;
  if (!row?.latest) return null;
  return Date.now() - new Date(row.latest).getTime();
}

/**
 * Clean up expired attention terms older than the given hours.
 */
export function pruneExpiredAttentionTerms(hoursOld = 72): void {
  const db = getDb();
  const cutoff = new Date(
    Date.now() - hoursOld * 60 * 60 * 1000,
  ).toISOString();
  db.prepare("DELETE FROM attention_terms WHERE expires_at < ?").run(cutoff);
}

// ---------------------------------------------------------------------------
// Resolutions (prediction vs. outcome tracking)
// ---------------------------------------------------------------------------

export interface ResolutionRecord {
  id?: number;
  marketId: string | null;
  eventType: "market_resolution" | "economic_release" | "geopolitical_event";
  eventDescription: string;
  category: string;
  outcome: string;
  resolvedAt: string;
  signals30d: string | null;
  signals7d: string | null;
  signals1d: string | null;
  signalsAtResolution: string | null;
  predictionMarketCorrect: number | null;
  pmConfidenceAtClose: number | null;
  consumerSentimentDirection: string | null;
  fearSignalsDirection: string | null;
  attentionLevel: string | null;
  aiRetrospective: string | null;
  createdAt: string;
}

/**
 * Save a resolution record.
 */
export function saveResolution(record: ResolutionRecord): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO resolutions
      (market_id, event_type, event_description, category, outcome,
       resolved_at, signals_30d, signals_7d, signals_1d, signals_at_resolution,
       prediction_market_correct, pm_confidence_at_close,
       consumer_sentiment_direction, fear_signals_direction, attention_level,
       ai_retrospective, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.marketId,
    record.eventType,
    record.eventDescription,
    record.category,
    record.outcome,
    record.resolvedAt,
    record.signals30d,
    record.signals7d,
    record.signals1d,
    record.signalsAtResolution,
    record.predictionMarketCorrect,
    record.pmConfidenceAtClose,
    record.consumerSentimentDirection,
    record.fearSignalsDirection,
    record.attentionLevel,
    record.aiRetrospective,
    record.createdAt,
  );
  return Number(result.lastInsertRowid);
}

/**
 * Check if a resolution record already exists for a market.
 */
export function hasResolution(marketId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 FROM resolutions WHERE market_id = ? LIMIT 1")
    .get(marketId);
  return !!row;
}

/**
 * Get markets that have resolved (resolution = 'yes' or 'no') but don't yet
 * have a resolution record. These are the markets we need to process.
 */
export function getNewlyResolvedMarkets(): {
  id: string;
  platform: string;
  question: string;
  category: string;
  yesPrice: number;
  resolution: string;
  sentimentDirection: string | null;
}[] {
  const db = getDb();
  return db.prepare(`
    SELECT m.id, m.platform, m.question, m.category, m.yes_price,
           m.resolution, m.sentiment_direction
    FROM markets m
    WHERE m.resolution IN ('yes', 'no')
      AND NOT EXISTS (
        SELECT 1 FROM resolutions r WHERE r.market_id = m.id
      )
  `).all() as {
    id: string;
    platform: string;
    question: string;
    category: string;
    yesPrice: number;
    resolution: string;
    sentimentDirection: string | null;
  }[];
}

/**
 * Get all resolution records, most recent first.
 */
export function getResolutions(limit = 50): ResolutionRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM resolutions ORDER BY resolved_at DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(hydrateResolutionRow);
}

/**
 * Get resolution records for a specific category.
 */
export function getResolutionsByCategory(
  category: string,
  limit = 50,
): ResolutionRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM resolutions WHERE category = ? ORDER BY resolved_at DESC LIMIT ?`,
    )
    .all(category, limit) as Record<string, unknown>[];
  return rows.map(hydrateResolutionRow);
}

/**
 * Compute track record statistics from all resolution records.
 */
export function computeTrackRecord(): {
  totalResolutions: number;
  predictionMarketAccuracy: number;
  signalConcordanceRate: number;
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
} | null {
  const db = getDb();

  const totalRow = db
    .prepare("SELECT COUNT(*) as count FROM resolutions WHERE event_type = 'market_resolution'")
    .get() as { count: number };
  const total = totalRow.count;
  if (total === 0) return null;

  const correctRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM resolutions WHERE event_type = 'market_resolution' AND prediction_market_correct = 1",
    )
    .get() as { count: number };

  // Concordance: how often did all available signals agree?
  // A resolution is "concordant" if consumer sentiment and fear signals
  // were both aligned or both neutral
  const concordantRow = db
    .prepare(
      `SELECT COUNT(*) as count FROM resolutions
       WHERE event_type = 'market_resolution'
         AND (consumer_sentiment_direction = 'aligned' OR consumer_sentiment_direction IS NULL)
         AND (fear_signals_direction = 'aligned' OR fear_signals_direction IS NULL)`,
    )
    .get() as { count: number };

  // Per-category breakdown
  const catRows = db
    .prepare(
      `SELECT category,
              COUNT(*) as total,
              SUM(CASE WHEN prediction_market_correct = 1 THEN 1 ELSE 0 END) as correct
       FROM resolutions
       WHERE event_type = 'market_resolution'
       GROUP BY category`,
    )
    .all() as { category: string; total: number; correct: number }[];

  const byCategory: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const row of catRows) {
    byCategory[row.category] = {
      total: row.total,
      correct: row.correct,
      accuracy: row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0,
    };
  }

  return {
    totalResolutions: total,
    predictionMarketAccuracy: total > 0 ? Math.round((correctRow.count / total) * 100) : 0,
    signalConcordanceRate: total > 0 ? Math.round((concordantRow.count / total) * 100) : 0,
    byCategory,
  };
}

function hydrateResolutionRow(row: Record<string, unknown>): ResolutionRecord {
  return {
    id: row.id as number,
    marketId: (row.market_id as string) ?? null,
    eventType: row.event_type as ResolutionRecord["eventType"],
    eventDescription: row.event_description as string,
    category: row.category as string,
    outcome: row.outcome as string,
    resolvedAt: row.resolved_at as string,
    signals30d: (row.signals_30d as string) ?? null,
    signals7d: (row.signals_7d as string) ?? null,
    signals1d: (row.signals_1d as string) ?? null,
    signalsAtResolution: (row.signals_at_resolution as string) ?? null,
    predictionMarketCorrect: (row.prediction_market_correct as number) ?? null,
    pmConfidenceAtClose: (row.pm_confidence_at_close as number) ?? null,
    consumerSentimentDirection: (row.consumer_sentiment_direction as string) ?? null,
    fearSignalsDirection: (row.fear_signals_direction as string) ?? null,
    attentionLevel: (row.attention_level as string) ?? null,
    aiRetrospective: (row.ai_retrospective as string) ?? null,
    createdAt: row.created_at as string,
  };
}

function hydrateAttentionRow(row: Record<string, unknown>): AttentionTerm {
  return {
    id: row.id as number,
    term: row.term as string,
    category: row.category as string,
    generatedReason: (row.generated_reason as string) ?? null,
    generatedAt: row.generated_at as string,
    expiresAt: row.expires_at as string,
    trendValue: (row.trend_value as number) ?? null,
    trendFetchedAt: (row.trend_fetched_at as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Narratives
// ---------------------------------------------------------------------------

export function saveNarrative(
  snapshotId: number,
  category: string | null,
  narrative: string,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO narratives (snapshot_id, category, narrative, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(snapshotId, category, narrative, new Date().toISOString());
}

export function getLatestNarrativeAge(): number | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT created_at FROM narratives WHERE category IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .get() as { created_at: string } | undefined;
  if (!row) return null;
  return Date.now() - new Date(row.created_at).getTime();
}

export function getLatestNarrative(
  category: string | null,
): string | null {
  const db = getDb();
  const row = db
    .prepare(
      category === null
        ? "SELECT narrative FROM narratives WHERE category IS NULL ORDER BY created_at DESC LIMIT 1"
        : "SELECT narrative FROM narratives WHERE category = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(...(category === null ? [] : [category])) as
    | { narrative: string }
    | undefined;
  return row?.narrative ?? null;
}

// ---------------------------------------------------------------------------
// Snapshots (composite index history)
// ---------------------------------------------------------------------------

interface SnapshotRow {
  id: number;
  timestamp: string;
  composite_score: number;
  composite_certainty: number;
  composite_conviction: number;
  total_markets: number;
}

interface CategorySnapshotRow {
  category: string;
  score: number;
  uncertainty: number;
  conviction: number;
  market_count: number;
  platform_breakdown: string;
}

interface DivergenceRow {
  category: string;
  spread: number;
  high_platform: string;
  high_score: number;
  low_platform: string;
  low_score: number;
}

export function saveSnapshot(index: CompositeIndex): number {
  const db = getDb();

  const insertSnapshot = db.prepare(`
    INSERT INTO snapshots (timestamp, composite_score, composite_certainty,
                           composite_conviction, total_markets)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertCategory = db.prepare(`
    INSERT INTO category_snapshots
      (snapshot_id, category, score, uncertainty, conviction,
       market_count, platform_breakdown)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDivergence = db.prepare(`
    INSERT INTO divergence_log
      (snapshot_id, category, spread, high_platform, high_score,
       low_platform, low_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const result = insertSnapshot.run(
      index.timestamp.toISOString(),
      index.momentum,      // store momentum in composite_score column
      index.volatility,    // store volatility in composite_certainty column
      index.activity,      // store activity in composite_conviction column
      index.totalMarkets,
    );

    const snapshotId = Number(result.lastInsertRowid);

    for (const cat of index.categories) {
      insertCategory.run(
        snapshotId,
        cat.category,
        cat.momentum,       // reuse score column for momentum
        cat.volatility,     // reuse uncertainty column for volatility
        cat.activity,       // reuse conviction column for activity
        cat.marketCount,
        JSON.stringify(cat.platformBreakdown),
      );
    }

    for (const div of index.divergences) {
      insertDivergence.run(
        snapshotId,
        div.category,
        div.spread,
        div.highPlatform,
        div.highPrice,
        div.lowPlatform,
        div.lowPrice,
      );
    }

    return snapshotId;
  });

  return run();
}

function hydrateSnapshot(
  row: SnapshotRow,
  catRows: CategorySnapshotRow[],
  divRows: DivergenceRow[],
): CompositeIndex {
  const categories: CategoryAnalysis[] = catRows.map((c) => ({
    category: c.category as CategoryId,
    momentum: c.score,
    volatility: c.uncertainty,
    activity: c.conviction,
    consensus: 0,
    marketCount: c.market_count,
    topMarkets: [],
    platformBreakdown: JSON.parse(c.platform_breakdown) as Record<
      Platform,
      { marketCount: number; avgPrice: number; momentum: number; weight: number }
    >,
    narrative: null,
  }));

  const divergences: Divergence[] = divRows.map((d) => ({
    category: d.category as CategoryId,
    question: "",
    spread: d.spread,
    highPlatform: d.high_platform as Platform,
    highPrice: d.high_score,
    lowPlatform: d.low_platform as Platform,
    lowPrice: d.low_score,
  }));

  return {
    momentum: row.composite_score,
    volatility: row.composite_certainty,
    activity: row.composite_conviction,
    totalMarkets: row.total_markets,
    categories,
    divergences,
    timestamp: new Date(row.timestamp),
    narrative: null,
  };
}

export function getLatestSnapshot(): CompositeIndex | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 1")
    .get() as SnapshotRow | undefined;

  if (!row) return null;

  const catRows = db
    .prepare("SELECT * FROM category_snapshots WHERE snapshot_id = ?")
    .all(row.id) as CategorySnapshotRow[];

  const divRows = db
    .prepare("SELECT * FROM divergence_log WHERE snapshot_id = ?")
    .all(row.id) as DivergenceRow[];

  return hydrateSnapshot(row, catRows, divRows);
}

export function getHistory(hours: number): CompositeIndex[] {
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const rows = db
    .prepare(
      "SELECT * FROM snapshots WHERE timestamp >= ? ORDER BY timestamp DESC",
    )
    .all(since) as SnapshotRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  const allCatRows = db
    .prepare(
      `SELECT * FROM category_snapshots WHERE snapshot_id IN (${placeholders})`,
    )
    .all(...ids) as (CategorySnapshotRow & { snapshot_id: number })[];

  const allDivRows = db
    .prepare(
      `SELECT * FROM divergence_log WHERE snapshot_id IN (${placeholders})`,
    )
    .all(...ids) as (DivergenceRow & { snapshot_id: number })[];

  return rows.map((row) =>
    hydrateSnapshot(
      row,
      allCatRows.filter((c) => c.snapshot_id === row.id),
      allDivRows.filter((d) => d.snapshot_id === row.id),
    ),
  );
}

export function getCategoryHistory(
  category: CategoryId,
  hours: number,
): { timestamp: Date; score: number }[] {
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const rows = db
    .prepare(
      `SELECT s.timestamp, cs.score
       FROM category_snapshots cs
       JOIN snapshots s ON s.id = cs.snapshot_id
       WHERE cs.category = ? AND s.timestamp >= ?
       ORDER BY s.timestamp DESC`,
    )
    .all(category, since) as { timestamp: string; score: number }[];

  return rows.map((r) => ({
    timestamp: new Date(r.timestamp),
    score: r.score,
  }));
}
