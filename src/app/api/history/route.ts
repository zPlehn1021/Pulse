import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export const revalidate = 300; // 5 min cache

interface SnapshotRow {
  id: number;
  timestamp: string;
  composite_score: number;
  total_markets: number;
}

interface CategorySnapshotRow {
  snapshot_id: number;
  category: string;
  score: number;
  market_count: number;
}

interface SignalReadingRow {
  signal_id: string;
  signal_name: string;
  value: number;
  recorded_at: string;
}

export async function GET() {
  try {
    const db = getDb();

    // 1. Composite sentiment over time (snapshots)
    const snapshots = db
      .prepare(
        `SELECT id, timestamp, composite_score, total_markets
         FROM snapshots
         ORDER BY timestamp ASC`,
      )
      .all() as SnapshotRow[];

    // 2. Category momentum over time
    const categorySnapshots = db
      .prepare(
        `SELECT cs.snapshot_id, cs.category, cs.score, cs.market_count
         FROM category_snapshots cs
         INNER JOIN snapshots s ON s.id = cs.snapshot_id
         ORDER BY s.timestamp ASC`,
      )
      .all() as CategorySnapshotRow[];

    // Build category time series: each snapshot gets category scores
    const snapshotMap = new Map<number, { timestamp: string; categories: Record<string, number> }>();
    for (const s of snapshots) {
      snapshotMap.set(s.id, { timestamp: s.timestamp, categories: {} });
    }
    for (const cs of categorySnapshots) {
      const snap = snapshotMap.get(cs.snapshot_id);
      if (snap) snap.categories[cs.category] = cs.score;
    }

    const sentimentHistory = snapshots.map((s) => ({
      timestamp: s.timestamp,
      composite: s.composite_score,
      totalMarkets: s.total_markets,
      ...(snapshotMap.get(s.id)?.categories ?? {}),
    }));

    // 3. FRED signal readings over time (all history)
    const signalReadings = db
      .prepare(
        `SELECT signal_id, signal_name, value, recorded_at
         FROM signal_readings
         ORDER BY recorded_at ASC`,
      )
      .all() as SignalReadingRow[];

    // Group by signal_id
    const signalHistory: Record<string, { name: string; readings: { value: number; timestamp: string }[] }> = {};
    for (const r of signalReadings) {
      if (!signalHistory[r.signal_id]) {
        signalHistory[r.signal_id] = { name: r.signal_name, readings: [] };
      }
      signalHistory[r.signal_id].readings.push({
        value: r.value,
        timestamp: r.recorded_at,
      });
    }

    // 4. Market activity over time (hourly buckets of price count)
    const marketActivity = db
      .prepare(
        `SELECT
           strftime('%Y-%m-%dT%H:00:00Z', recorded_at) as hour,
           COUNT(*) as pricePoints,
           COUNT(DISTINCT market_id) as uniqueMarkets,
           AVG(yes_price) as avgPrice
         FROM market_prices
         GROUP BY strftime('%Y-%m-%dT%H:00:00Z', recorded_at)
         ORDER BY hour ASC`,
      )
      .all() as { hour: string; pricePoints: number; uniqueMarkets: number; avgPrice: number }[];

    // 5. Attention term snapshots (if terms have been fetched multiple times)
    const attentionHistory = db
      .prepare(
        `SELECT
           strftime('%Y-%m-%dT%H:00:00Z', trend_fetched_at) as hour,
           AVG(CASE WHEN trend_value IS NOT NULL THEN trend_value END) as avgTrend,
           COUNT(CASE WHEN trend_value > 50 THEN 1 END) as highInterest,
           COUNT(CASE WHEN trend_value IS NOT NULL AND trend_value <= 20 THEN 1 END) as lowInterest,
           COUNT(*) as totalTerms
         FROM attention_terms
         WHERE trend_fetched_at IS NOT NULL
         GROUP BY strftime('%Y-%m-%dT%H:00:00Z', trend_fetched_at)
         ORDER BY hour ASC`,
      )
      .all() as { hour: string; avgTrend: number; highInterest: number; lowInterest: number; totalTerms: number }[];

    return NextResponse.json({
      sentimentHistory,
      signalHistory,
      marketActivity,
      attentionHistory,
      meta: {
        snapshotCount: snapshots.length,
        signalReadingCount: signalReadings.length,
        pricePointCount: marketActivity.reduce((sum, m) => sum + m.pricePoints, 0),
        dataRange: {
          from: snapshots[0]?.timestamp ?? null,
          to: snapshots[snapshots.length - 1]?.timestamp ?? null,
        },
      },
    });
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
