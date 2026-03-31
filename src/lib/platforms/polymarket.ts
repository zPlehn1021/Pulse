import type { NormalizedMarket, CategoryId, PlatformAdapter } from "@/lib/platforms/types";
import { CATEGORIES, getPolymarketTagId } from "@/lib/sentiment/categories";
import { withRetry, fetchOrThrow } from "./retry";

const BASE_URL = "https://gamma-api.polymarket.com";

interface PolymarketRawMarket {
  id: string;
  question: string;
  slug: string;
  outcomePrices: string;   // e.g. "[\"0.65\",\"0.35\"]"
  volume24hr: number;
  liquidityNum: number;
  closed: boolean;
  endDate: string;
  description: string;
}

function parseYesPrice(outcomePrices: string): number {
  try {
    const prices: string[] = JSON.parse(outcomePrices);
    const parsed = parseFloat(prices[0]);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  } catch {
    // malformed JSON — fall through
  }
  return 0.5;
}

function toNormalized(
  raw: PolymarketRawMarket,
  category: CategoryId,
): NormalizedMarket {
  return {
    id: `polymarket-${raw.id}`,
    platform: "polymarket",
    question: raw.question,
    category,
    yesPrice: parseYesPrice(raw.outcomePrices),
    volume24h: raw.volume24hr ?? 0,
    liquidity: raw.liquidityNum ?? 0,
    lastUpdated: new Date(),
    sourceUrl: `https://polymarket.com/event/${raw.slug}`,
    resolution: raw.closed ? null : undefined,
  };
}

/**
 * Fetch top-50 open markets for a single category using its Polymarket tag ID.
 */
export async function fetchPolymarketByCategory(
  category: CategoryId,
): Promise<NormalizedMarket[]> {
  const tagId = getPolymarketTagId(category);
  const url =
    `${BASE_URL}/markets?tag_id=${tagId}&closed=false` +
    `&order=volume24hr&ascending=false&limit=50`;

  try {
    const res = await withRetry(
      () => fetchOrThrow(url, { next: { revalidate: 300 } }),
      { platform: "polymarket", endpoint: `/markets?tag=${category}` },
    );
    const raw: PolymarketRawMarket[] = await res.json();
    return raw.map((m) => toNormalized(m, category));
  } catch (err) {
    console.error(`[polymarket] Failed to fetch ${category}:`, err);
    return [];
  }
}

/**
 * Fetch markets across all 6 categories in parallel, deduplicate by market ID.
 */
export async function fetchAllPolymarket(): Promise<NormalizedMarket[]> {
  const categoryIds = CATEGORIES.map((c) => c.id);

  const results = await Promise.allSettled(
    categoryIds.map((cat) => fetchPolymarketByCategory(cat)),
  );

  const seen = new Set<string>();
  const markets: NormalizedMarket[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const m of result.value) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        markets.push(m);
      }
    }
  }

  return markets;
}

/**
 * PlatformAdapter interface for use in the cron refresh pipeline.
 */
export const polymarket: PlatformAdapter = {
  platform: "polymarket",
  fetchMarkets: fetchAllPolymarket,
};
