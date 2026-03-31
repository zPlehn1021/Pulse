import { NextResponse } from "next/server";
import {
  upsertMarkets,
  saveSnapshot,
  saveMarketPrices,
  saveNarrative,
  getLatestNarrativeAge,
  pruneOldPrices,
} from "@/lib/db/client";
import { computeCompositeIndex } from "@/lib/sentiment/compute";
import { generateAllNarratives } from "@/lib/sentiment/narrative";
import { polymarket } from "@/lib/platforms/polymarket";
import { kalshi } from "@/lib/platforms/kalshi";
import { manifold } from "@/lib/platforms/manifold";
import { predictit } from "@/lib/platforms/predictit";
import { feargreed } from "@/lib/platforms/feargreed";
import {
  recordSuccess,
  recordFailure,
  shouldAttemptRecovery,
  getPlatformHealth,
} from "@/lib/platforms/health";
import type { NormalizedMarket, PlatformAdapter } from "@/lib/platforms/types";

const adapters: PlatformAdapter[] = [
  polymarket,
  kalshi,
  manifold,
  predictit,
  feargreed,
];

export const dynamic = "force-dynamic";

async function handleRefresh(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const results: Record<string, { count: number; error?: string }> = {};
  const allMarkets: NormalizedMarket[] = [];

  // Fetch from all platforms in parallel
  const fetches = await Promise.allSettled(
    adapters.map(async (adapter) => {
      if (!shouldAttemptRecovery(adapter.platform)) {
        return { platform: adapter.platform, markets: [], skipped: true };
      }
      const markets = await adapter.fetchMarkets();
      return { platform: adapter.platform, markets, skipped: false };
    }),
  );

  for (const result of fetches) {
    if (result.status === "fulfilled") {
      const { platform, markets, skipped } = result.value;

      if (skipped) {
        results[platform] = { count: 0, error: "skipped (degraded)" };
        continue;
      }

      if (markets.length > 0) {
        recordSuccess(platform);
      } else {
        recordFailure(platform);
      }

      results[platform] = { count: markets.length };
      allMarkets.push(...markets);
    } else {
      const errStr = String(result.reason);
      const platform = adapters.find((a) =>
        errStr.toLowerCase().includes(a.platform),
      )?.platform;
      if (platform) recordFailure(platform);
      results[platform ?? "unknown"] = { count: 0, error: errStr };
    }
  }

  let snapshotId: number | null = null;
  let narrativeGenerated = false;

  if (allMarkets.length > 0) {
    // 1. Upsert current market state
    upsertMarkets(allMarkets);

    // 2. Save per-market price snapshot (for momentum/volatility tracking)
    saveMarketPrices(allMarkets);

    // 3. Compute the new analysis
    const index = computeCompositeIndex(allMarkets);

    // 4. Save composite snapshot
    snapshotId = saveSnapshot(index);

    // 5. Generate AI narratives — throttled to every 30 min to save tokens
    const narrativeAge = getLatestNarrativeAge();
    const NARRATIVE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    const shouldGenerateNarrative =
      process.env.ANTHROPIC_API_KEY &&
      (narrativeAge === null || narrativeAge > NARRATIVE_INTERVAL_MS);

    if (shouldGenerateNarrative) {
      try {
        const narratives = await generateAllNarratives(index);

        if (narratives.overall && snapshotId) {
          saveNarrative(snapshotId, null, narratives.overall);
        }
        for (const [category, narrative] of Object.entries(
          narratives.categories,
        )) {
          if (narrative && snapshotId) {
            saveNarrative(snapshotId, category, narrative);
          }
        }
        narrativeGenerated = true;
      } catch (err) {
        console.error("Narrative generation failed:", err);
      }
    }

    // 6. Prune old price data (keep 48 hours)
    pruneOldPrices(48);
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    totalMarkets: allMarkets.length,
    snapshotId,
    narrativeGenerated,
    results,
    health: getPlatformHealth(),
    fetchDuration: Date.now() - start,
  });
}

export async function POST(request: Request) {
  return handleRefresh(request);
}

export async function GET(request: Request) {
  return handleRefresh(request);
}
