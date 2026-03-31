import type { NormalizedMarket, PlatformAdapter } from "@/lib/platforms/types";
import { withRetry, fetchOrThrow } from "./retry";

const API_URL = "https://api.alternative.me/fng/?limit=7&format=json";

/**
 * Fixed synthetic weight — meaningful contribution to crypto category
 * sentiment but won't dominate real prediction markets.
 */
const SYNTHETIC_VOLUME = 500;

const SOURCE_URL = "https://alternative.me/crypto/fear-and-greed-index/";

export interface FearGreedReading {
  value: number;
  classification: string;
  timestamp: Date;
}

interface FearGreedApiEntry {
  value: string;
  value_classification: string;
  timestamp: string;
  time_until_update?: string;
}

interface FearGreedApiResponse {
  name: string;
  data: FearGreedApiEntry[];
  metadata: { error: string | null };
}

function parseEntry(entry: FearGreedApiEntry): FearGreedReading {
  return {
    value: parseInt(entry.value, 10),
    classification: entry.value_classification,
    timestamp: new Date(parseInt(entry.timestamp, 10) * 1000),
  };
}

function toNormalized(reading: FearGreedReading): NormalizedMarket {
  return {
    id: "feargreed-latest",
    platform: "feargreed",
    question: `Crypto Fear & Greed Index: ${reading.classification}`,
    category: "crypto",
    yesPrice: Math.max(0, Math.min(1, reading.value / 100)),
    volume24h: SYNTHETIC_VOLUME,
    liquidity: 0,
    lastUpdated: reading.timestamp,
    sourceUrl: SOURCE_URL,
  };
}

/**
 * Fetch the Crypto Fear & Greed Index with 7-day history.
 * Returns the current reading, history array, and a normalized
 * market entry for the sentiment engine.
 *
 * Returns null if the API fails.
 */
export async function fetchFearGreedIndex(): Promise<{
  current: FearGreedReading;
  history: FearGreedReading[];
  normalized: NormalizedMarket;
} | null> {
  try {
    const res = await withRetry(
      () => fetchOrThrow(API_URL, { next: { revalidate: 300 } }),
      { platform: "feargreed", endpoint: "/fng" },
    );

    const data: FearGreedApiResponse = await res.json();

    if (data.metadata?.error || !data.data || data.data.length === 0) {
      throw new Error(
        `Fear & Greed API error: ${data.metadata?.error ?? "no data"}`,
      );
    }

    const current = parseEntry(data.data[0]);
    const history = data.data.map(parseEntry);
    const normalized = toNormalized(current);

    return { current, history, normalized };
  } catch (err) {
    console.error("[feargreed] Fetch failed:", err);
    return null;
  }
}

/**
 * PlatformAdapter interface for use in the cron refresh pipeline.
 * Wraps fetchFearGreedIndex to return a single-element array.
 */
export const feargreed: PlatformAdapter = {
  platform: "feargreed",
  async fetchMarkets(): Promise<NormalizedMarket[]> {
    const result = await fetchFearGreedIndex();
    return result ? [result.normalized] : [];
  },
};
