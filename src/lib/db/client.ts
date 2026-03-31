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
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Markets (current state)
// ---------------------------------------------------------------------------

export function upsertMarkets(markets: NormalizedMarket[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO markets
      (id, platform, question, category, yes_price,
       volume_24h, liquidity, last_updated, source_url, resolution)
    VALUES
      (@id, @platform, @question, @category, @yesPrice,
       @volume24h, @liquidity, @lastUpdated, @sourceUrl, @resolution)
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
  };
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
