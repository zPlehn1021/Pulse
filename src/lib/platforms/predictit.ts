import type { NormalizedMarket, PlatformAdapter } from "@/lib/platforms/types";
import { categorizeByKeywords } from "@/lib/sentiment/categories";
import { withRetry, fetchOrThrow } from "./retry";

const API_URL = "https://www.predictit.org/api/marketdata/all/";

/**
 * PredictIt doesn't expose volume via its API.
 * Use a fixed synthetic weight so contracts contribute modestly
 * to category scores without overpowering real-volume platforms.
 */
const SYNTHETIC_VOLUME = 100;

interface PredictItContract {
  id: number;
  name: string;
  shortName: string;
  status: string;
  lastTradePrice: number | null;
  bestBuyYesCost: number | null;
  bestBuyNoCost: number | null;
  bestSellYesCost: number | null;
  bestSellNoCost: number | null;
}

interface PredictItMarket {
  id: number;
  name: string;
  shortName: string;
  url: string;
  timeStamp: string;
  status: string;
  contracts: PredictItContract[];
}

interface PredictItResponse {
  markets: PredictItMarket[];
}

function toNormalized(
  market: PredictItMarket,
  contract: PredictItContract,
): NormalizedMarket {
  const question = `${market.name} — ${contract.name}`;

  // PredictIt is almost entirely US politics; check keywords for exceptions
  const category = categorizeByKeywords(question) ?? "politics";

  return {
    id: `predictit-${market.id}-${contract.id}`,
    platform: "predictit",
    question,
    category,
    yesPrice: Math.max(0, Math.min(1, contract.lastTradePrice ?? 0.5)),
    volume24h: SYNTHETIC_VOLUME,
    liquidity: 0,
    lastUpdated: new Date(market.timeStamp),
    sourceUrl: market.url,
  };
}

/**
 * Fetch all open PredictIt markets and flatten contracts into
 * individual NormalizedMarket entries.
 */
export async function fetchAllPredictIt(): Promise<NormalizedMarket[]> {
  try {
    const res = await withRetry(
      () => fetchOrThrow(API_URL, { next: { revalidate: 300 } }),
      { platform: "predictit", endpoint: "/marketdata/all" },
    );

    const data: PredictItResponse = await res.json();
    const allMarkets: NormalizedMarket[] = [];

    for (const market of data.markets ?? []) {
      if (market.status !== "Open") continue;

      for (const contract of market.contracts) {
        if (contract.status !== "Open") continue;
        if (
          contract.lastTradePrice === null ||
          contract.lastTradePrice <= 0 ||
          contract.lastTradePrice >= 1
        ) continue;

        allMarkets.push(toNormalized(market, contract));
      }
    }

    return allMarkets;
  } catch (err) {
    console.error("[predictit] Fetch failed:", err);
    return [];
  }
}

/**
 * PlatformAdapter interface for use in the cron refresh pipeline.
 */
export const predictit: PlatformAdapter = {
  platform: "predictit",
  fetchMarkets: fetchAllPredictIt,
};
