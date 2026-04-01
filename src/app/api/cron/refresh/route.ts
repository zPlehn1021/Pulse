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
import { classifyNewMarkets } from "@/lib/sentiment/classify";
import { fetchAllFredData } from "@/lib/platforms/fred";
import { fetchTrendsForAttentionTerms } from "@/lib/platforms/trends";
import { curateAttentionTerms } from "@/lib/sentiment/curate-terms";
import { processNewResolutions } from "@/lib/sentiment/resolution";
import {
  getSignalSourceAge,
  getAttentionTermsAge,
  pruneExpiredAttentionTerms,
} from "@/lib/db/client";
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

// Hard timeout for the entire refresh cycle (2 minutes)
const REFRESH_TIMEOUT_MS = 120_000;

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

  // Fetch from all platforms in parallel, with per-platform timeout
  const PLATFORM_TIMEOUT_MS = 60_000; // 60s per platform
  const fetches = await Promise.allSettled(
    adapters.map(async (adapter) => {
      if (!shouldAttemptRecovery(adapter.platform)) {
        return { platform: adapter.platform, markets: [] as NormalizedMarket[], skipped: true };
      }
      const markets = await Promise.race([
        adapter.fetchMarkets(),
        new Promise<NormalizedMarket[]>((_, reject) =>
          setTimeout(() => reject(new Error(`${adapter.platform} timed out after ${PLATFORM_TIMEOUT_MS / 1000}s`)), PLATFORM_TIMEOUT_MS),
        ),
      ]);
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
  let marketsClassified = 0;
  let resolutionsProcessed = 0;
  let fredResult: { saved: number; skipped: number; errors: string[] } | null = null;
  let attentionResult: { termsCurated: number; trendsFetched: number } | null = null;

  // Hourly tasks (FRED + attention) — run on every cycle but skip if data is fresh
  const HOURLY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  // FRED data fetch
  const fredAge = getSignalSourceAge("fred");
  const shouldFetchFred =
    process.env.FRED_API_KEY &&
    (fredAge === null || fredAge > HOURLY_INTERVAL_MS);

  if (shouldFetchFred) {
    try {
      fredResult = await fetchAllFredData();
    } catch (err) {
      console.error("FRED fetch failed:", err);
    }
  }

  // AI-curated attention terms + Google Trends fetch
  const attentionAge = getAttentionTermsAge();
  const shouldCurateTerms =
    process.env.ANTHROPIC_API_KEY &&
    (attentionAge === null || attentionAge > HOURLY_INTERVAL_MS);

  if (shouldCurateTerms) {
    try {
      const termsCurated = await curateAttentionTerms();
      let trendsFetched = 0;
      if (termsCurated > 0) {
        trendsFetched = await fetchTrendsForAttentionTerms();
      }
      attentionResult = { termsCurated, trendsFetched };
      // Clean up old expired terms
      pruneExpiredAttentionTerms(72);
    } catch (err) {
      console.error("Attention curation failed:", err);
    }
  }

  if (allMarkets.length > 0) {
    // 1. Upsert current market state
    try {
      upsertMarkets(allMarkets);
    } catch (err) {
      console.error("Market upsert failed:", err);
    }

    // 2. Classify new markets for sentiment direction (positive/negative/neutral)
    try {
      marketsClassified = await classifyNewMarkets();
    } catch (err) {
      console.error("Sentiment classification failed:", err);
    }

    // 3. Check for newly resolved markets → create resolution records
    try {
      resolutionsProcessed = await processNewResolutions();
    } catch (err) {
      console.error("Resolution processing failed:", err);
    }

    // 4. Save per-market price snapshot (for momentum/volatility tracking)
    try {
      saveMarketPrices(allMarkets);
    } catch (err) {
      console.error("Market price save failed:", err);
    }

    // 5. Compute the new analysis (now with signal layers from FRED)
    try {
      const index = computeCompositeIndex(allMarkets);

      // 6. Save composite snapshot
      snapshotId = saveSnapshot(index);

      // 7. Generate AI narratives — throttled to every 60 min to save tokens
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
          // Store key insights as JSON
          if (narratives.keyInsights?.length > 0 && snapshotId) {
            saveNarrative(snapshotId, "__key_insights__", JSON.stringify(narratives.keyInsights));
          }
          narrativeGenerated = true;
        } catch (err) {
          console.error("Narrative generation failed:", err);
        }
      }
    } catch (err) {
      console.error("Composite index computation failed:", err);
    }

    // 8. Prune old price data (keep 48 hours)
    try {
      pruneOldPrices(48);
    } catch (err) {
      console.error("Price pruning failed:", err);
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    totalMarkets: allMarkets.length,
    snapshotId,
    narrativeGenerated,
    marketsClassified,
    resolutionsProcessed,
    fred: fredResult
      ? { saved: fredResult.saved, skipped: fredResult.skipped, errors: fredResult.errors }
      : null,
    attention: attentionResult,
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
