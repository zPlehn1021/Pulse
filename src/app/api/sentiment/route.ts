import { NextResponse } from "next/server";
import { getMarkets, getHistory, getLatestNarrative } from "@/lib/db/client";
import { computeCompositeIndex } from "@/lib/sentiment/compute";
import { fetchFearGreedIndex } from "@/lib/platforms/feargreed";
import { getPlatformHealth } from "@/lib/platforms/health";

export const revalidate = 60;

export async function GET() {
  const start = Date.now();

  try {
    const markets = getMarkets();
    const index = computeCompositeIndex(markets);
    const history = getHistory(24);

    // Fetch live Fear & Greed data for the standalone widget
    const fearGreedResult = await fetchFearGreedIndex();
    const fearGreed = fearGreedResult
      ? { current: fearGreedResult.current, history: fearGreedResult.history }
      : null;

    // Attach cached narratives from DB
    const overallNarrative = getLatestNarrative(null);
    index.narrative = overallNarrative;

    for (const cat of index.categories) {
      const catNarrative = getLatestNarrative(cat.category);
      if (catNarrative) {
        cat.narrative = catNarrative;
      }
    }

    // Build platform status
    const platformCounts: Record<string, number> = {};
    for (const m of markets) {
      platformCounts[m.platform] = (platformCounts[m.platform] || 0) + 1;
    }

    const platformStatus: Record<
      string,
      { available: boolean; count: number }
    > = {};
    for (const p of [
      "polymarket",
      "kalshi",
      "manifold",
      "predictit",
      "feargreed",
    ] as const) {
      platformStatus[p] = {
        available: (platformCounts[p] || 0) > 0,
        count: platformCounts[p] || 0,
      };
    }

    return NextResponse.json({
      index,
      history,
      fearGreed,
      platformStatus,
      totalMarkets: markets.length,
      meta: {
        platforms: getPlatformHealth(),
        fetchDuration: Date.now() - start,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to compute sentiment:", error);
    return NextResponse.json(
      { error: "Failed to compute sentiment" },
      { status: 500 },
    );
  }
}
