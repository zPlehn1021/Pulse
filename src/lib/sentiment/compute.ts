import type {
  NormalizedMarket,
  MarketWithMomentum,
  CategoryId,
  CategoryAnalysis,
  CompositeIndex,
  Platform,
  PLATFORM_TIERS,
  SignalLayersData,
  SignalTension,
} from "@/lib/platforms/types";
import { PLATFORM_TIERS as TIERS } from "@/lib/platforms/types";
import { CATEGORIES } from "./categories";
import { matchMarketsAcrossPlatforms } from "./matcher";
import {
  getCategoryPriceDeltas,
  getCategorySentimentDirections,
  getLatestAttentionTerms,
  type SentimentDirection,
} from "@/lib/db/client";
import { computeSignalLayers } from "./signals";
import { computeAttentionScores } from "@/lib/platforms/trends";
import { detectTensions } from "./tensions";

const ALL_PLATFORMS: Platform[] = [
  "polymarket",
  "kalshi",
  "manifold",
  "predictit",
  "feargreed",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Standard deviation of an array of numbers.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Clamp a value to a range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Effective weight for a question = engagement-based weight * platform credibility.
 * Uses log-engagement to prevent high-participation questions from drowning everything.
 * Index platforms (feargreed) get weight=0 — they're shown separately.
 */
function effectiveWeight(market: NormalizedMarket): number {
  const tierWeight = TIERS[market.platform].weight;
  if (tierWeight === 0) return 0;
  const volWeight = Math.max(Math.log10(market.volume24h + 1), 0.1);
  return volWeight * tierWeight;
}

// ---------------------------------------------------------------------------
// Enrich markets with momentum data
// ---------------------------------------------------------------------------

export function enrichMarketsWithMomentum(
  markets: NormalizedMarket[],
  priceDeltas: Map<
    string,
    {
      price5m: number | null;
      price1h: number | null;
      price6h: number | null;
      price24h: number | null;
      prices24h: number[];
    }
  >,
): MarketWithMomentum[] {
  return markets.map((m) => {
    const deltas = priceDeltas.get(m.id);
    const price5m = deltas?.price5m ?? null;
    const price1h = deltas?.price1h ?? null;
    const price6h = deltas?.price6h ?? null;
    const price24h = deltas?.price24h ?? null;

    // Use the best available delta: prefer 24h, fall back to 6h → 1h → 5m
    // This means momentum shows data immediately but improves over time
    const bestRef = price24h ?? price6h ?? price1h ?? price5m;
    const delta24h = bestRef !== null ? m.yesPrice - bestRef : 0;

    // Volatility: stddev of all price samples in last 24h
    const prices = deltas?.prices24h ?? [];
    const vol = prices.length >= 2 ? stddev(prices) : 0;

    return {
      ...m,
      priceHoursAgo1: price1h,
      priceHoursAgo6: price6h,
      priceHoursAgo24: price24h,
      delta24h,
      volatility: vol,
    };
  });
}

// ---------------------------------------------------------------------------
// Category-level analysis
// ---------------------------------------------------------------------------

/**
 * Check if a market is near expiration (within 48 hours of close).
 * Near-expiration markets converge to 0 or 1 and create fake momentum/volatility.
 */
function isNearExpiration(m: NormalizedMarket, hoursThreshold = 48): boolean {
  if (!m.closeDate) return false;
  const msUntilClose = m.closeDate.getTime() - Date.now();
  return msUntilClose >= 0 && msUntilClose < hoursThreshold * 60 * 60 * 1000;
}

/**
 * Check if a market is past its close date (expired but not yet marked resolved).
 */
function isPastExpiration(m: NormalizedMarket): boolean {
  if (!m.closeDate) return false;
  return m.closeDate.getTime() < Date.now();
}

/**
 * Check if a market has effectively converged (price near 0 or 1).
 * Markets at >97% or <3% are essentially resolved and create noise.
 */
function isConverged(m: NormalizedMarket, threshold = 0.97): boolean {
  return m.yesPrice >= threshold || m.yesPrice <= (1 - threshold);
}

export function computeCategoryAnalysis(
  allMarkets: NormalizedMarket[],
  category: CategoryId,
): CategoryAnalysis {
  const catMarkets = allMarkets.filter(
    (m) =>
      m.category === category &&
      m.resolution === undefined &&
      !isPastExpiration(m) &&    // Exclude expired-but-unresolved markets
      !isNearExpiration(m) &&    // Exclude markets within 48h of close
      !isConverged(m),           // Exclude effectively resolved markets (>97% or <3%)
  );

  // Fetch price history from DB for this category
  const priceDeltas = getCategoryPriceDeltas(category);

  // Fetch sentiment direction classifications for this category
  const sentimentDirs = getCategorySentimentDirections(category);

  // Enrich with momentum
  const enriched = enrichMarketsWithMomentum(catMarkets, priceDeltas);

  // -- SENTIMENT: engagement-weighted average of belief shifts --
  // Now sentiment-direction-aware:
  //   positive markets: price up → momentum up (optimism growing)
  //   negative markets: price up → momentum DOWN (pessimism growing)
  //   neutral markets: excluded from momentum (tracked for volatility/attention only)
  let momentumNum = 0;
  let momentumDen = 0;
  for (const m of enriched) {
    const w = effectiveWeight(m);
    if (w > 0 && m.delta24h !== 0) {
      const direction = sentimentDirs.get(m.id) ?? null;

      // Apply sentiment direction: flip sign for negative markets, skip neutral
      if (direction === "neutral") continue;
      const sign = direction === "negative" ? -1 : 1;
      momentumNum += m.delta24h * sign * w;
      momentumDen += w;
    }
  }
  // Scale: a 10pp average move across all markets = ±100 momentum
  const rawMomentum = momentumDen > 0 ? (momentumNum / momentumDen) * 1000 : 0;
  const momentum = clamp(Math.round(rawMomentum), -100, 100);

  // -- UNCERTAINTY: how much beliefs are shifting --
  // Scaled to 0-100 (a stddev of 0.05 = 50% uncertainty score)
  let volNum = 0;
  let volDen = 0;
  for (const m of enriched) {
    const w = effectiveWeight(m);
    if (w > 0) {
      volNum += m.volatility * w;
      volDen += w;
    }
  }
  const rawVol = volDen > 0 ? volNum / volDen : 0;
  const volatility = clamp(Math.round(rawVol * 2000), 0, 100);

  // -- ENGAGEMENT: combines question count + total participation --
  // Logarithmic scale so it doesn't blow up with high-engagement categories
  const totalVolume = catMarkets.reduce((s, m) => s + m.volume24h, 0);
  const activityRaw =
    Math.log10(totalVolume + 1) * 5 + Math.log10(catMarkets.length + 1) * 15;
  const activity = clamp(Math.round(activityRaw), 0, 100);

  // -- PLATFORM BREAKDOWN --
  const platformBreakdown = {} as CategoryAnalysis["platformBreakdown"];
  for (const p of ALL_PLATFORMS) {
    const pMarkets = enriched.filter((m) => m.platform === p);
    if (pMarkets.length === 0) {
      platformBreakdown[p] = {
        marketCount: 0,
        avgPrice: 0,
        momentum: 0,
        weight: TIERS[p].weight,
      };
      continue;
    }

    const avgPrice =
      pMarkets.reduce((s, m) => s + m.yesPrice, 0) / pMarkets.length;

    // Platform momentum: average delta for this platform's markets
    const pDeltas = pMarkets.filter((m) => m.delta24h !== 0);
    const pMomentum =
      pDeltas.length > 0
        ? pDeltas.reduce((s, m) => s + m.delta24h, 0) / pDeltas.length
        : 0;

    platformBreakdown[p] = {
      marketCount: pMarkets.length,
      avgPrice: Math.round(avgPrice * 100) / 100,
      momentum: clamp(Math.round(pMomentum * 1000), -100, 100),
      weight: TIERS[p].weight,
    };
  }

  // -- TOP MARKETS by volume, enriched --
  const sorted = [...enriched].sort((a, b) => b.volume24h - a.volume24h);

  return {
    category,
    marketCount: catMarkets.length,
    momentum,
    activity,
    consensus: 0, // filled in by matcher
    volatility,
    topMarkets: sorted.slice(0, 5),
    platformBreakdown,
    narrative: null, // filled in by AI
  };
}

// ---------------------------------------------------------------------------
// Composite index
// ---------------------------------------------------------------------------

export function computeCompositeIndex(
  allMarkets: NormalizedMarket[],
): CompositeIndex {
  const categories: CategoryAnalysis[] = CATEGORIES.map((cat) =>
    computeCategoryAnalysis(allMarkets, cat.id),
  );

  const activeCats = categories.filter((c) => c.marketCount > 0);

  // Weighted average of category metrics (weight by activity level)
  let momNum = 0,
    momDen = 0;
  let volNum = 0,
    volDen = 0;
  let actTotal = 0;

  for (const c of activeCats) {
    const w = Math.max(c.activity, 1);
    momNum += c.momentum * w;
    momDen += w;
    volNum += c.volatility * w;
    volDen += w;
    actTotal += c.activity;
  }

  const momentum = momDen > 0 ? Math.round(momNum / momDen) : 0;
  const volatility = volDen > 0 ? Math.round(volNum / volDen) : 0;
  const activity =
    activeCats.length > 0
      ? Math.round(actTotal / activeCats.length)
      : 0;

  // Cross-platform divergences (real matches)
  const divergences = matchMarketsAcrossPlatforms(allMarkets);

  // Fill in consensus scores from matches
  for (const cat of categories) {
    const catDivs = divergences.filter((d) => d.category === cat.category);
    if (catDivs.length === 0) {
      cat.consensus = 100; // no matches = can't measure disagreement
    } else {
      // Average spread of matched markets: lower spread = higher consensus
      const avgSpread =
        catDivs.reduce((s, d) => s + d.spread, 0) / catDivs.length;
      cat.consensus = clamp(Math.round(100 - avgSpread * 2), 0, 100);
    }
  }

  const totalMarkets = categories.reduce((s, c) => s + c.marketCount, 0);

  // v2: Compute signal layers from FRED + attention data (graceful if no data yet)
  let signalLayers: SignalLayersData | null = null;
  try {
    const layers = computeSignalLayers();

    // Attention layer: compute from latest curated terms
    const attentionTerms = getLatestAttentionTerms();
    const attention = computeAttentionScores(attentionTerms);

    // Attention-market gap: how much does public attention diverge from market pricing?
    // High gap = markets see something the public hasn't noticed (or vice versa)
    // Simple heuristic: if overall attention is low but markets are active, gap is high
    const marketActivity = activity; // 0-100
    const publicAwareness = attention.overall; // 0-100
    const attentionMarketGap = Math.abs(marketActivity - publicAwareness);

    const attentionConfidence = attentionTerms.length > 0
      ? Math.round((attentionTerms.filter((t) => t.trendValue !== null).length / attentionTerms.length) * 100)
      : 0;

    signalLayers = {
      predictionMarkets: {
        momentum,
        confidence: totalMarkets > 50 ? 100 : Math.round((totalMarkets / 50) * 100),
        marketCount: totalMarkets,
      },
      economicPsychology: {
        consumerSentiment: layers.economicPsychology.consumerSentiment,
        consumerSentimentTrend: layers.economicPsychology.consumerSentimentTrend,
        expectationsVsPresent: layers.economicPsychology.expectationsVsPresent,
        unemploymentRate: layers.economicPsychology.unemploymentRate,
        joblessClaimsTrend: layers.economicPsychology.joblessClaimsTrend,
        retailSalesTrend: layers.economicPsychology.retailSalesTrend,
        savingsRate: layers.economicPsychology.savingsRate,
        confidence: layers.economicPsychology.confidence,
      },
      fearSignals: {
        composite: layers.fearSignals.composite,
        vix: layers.fearSignals.vix,
        vixLevel: layers.fearSignals.vixLevel,
        yieldCurveSpread: layers.fearSignals.yieldCurveSpread,
        yieldCurveInverted: layers.fearSignals.yieldCurveInverted,
        goldTrend: layers.fearSignals.goldTrend,
        confidence: layers.fearSignals.confidence,
      },
      attention: {
        publicAwareness,
        topTerms: attention.topTerms.map((t) => t.term),
        attentionMarketGap,
        confidence: attentionConfidence,
      },
    };
  } catch (err) {
    console.error("Signal layers computation failed:", err);
  }

  // v2: Detect cross-layer signal tensions
  let tensions: SignalTension[] = [];
  if (signalLayers) {
    try {
      tensions = detectTensions({
        signalLayers,
        overallMomentum: momentum,
        overallActivity: activity,
      });
    } catch (err) {
      console.error("Tension detection failed:", err);
    }
  }

  return {
    momentum,
    volatility,
    activity,
    totalMarkets,
    categories,
    divergences: divergences.slice(0, 10), // top 10 by spread
    timestamp: new Date(),
    narrative: null,
    signalLayers,
    tensions,
  };
}
