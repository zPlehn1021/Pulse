import type { NormalizedMarket, PlatformAdapter } from "@/lib/platforms/types";
import { categorizeByKeywords } from "@/lib/sentiment/categories";
import { withRetry, fetchOrThrow } from "./retry";

const BASE_URL = "https://api.manifold.markets/v0";
const PAGE_LIMIT = 200;

/**
 * Manifold uses play money (mana), not real USD.
 * Apply a dampening factor so Manifold volumes don't overpower
 * real-money platforms (Polymarket, Kalshi) in volume-weighted scores.
 */
const VOLUME_DAMPENING = 0.1;

interface ManifoldMarket {
  id: string;
  slug: string;
  question: string;
  creatorUsername: string;
  probability: number;
  volume24Hours: number;
  totalLiquidity: number;
  closeTime: number;
  isResolved: boolean;
  url: string;
  outcomeType: string;
  resolution?: string;
}

function toNormalized(m: ManifoldMarket): NormalizedMarket {
  let resolution: "yes" | "no" | null | undefined;
  if (m.isResolved) {
    resolution =
      m.resolution === "YES" ? "yes" : m.resolution === "NO" ? "no" : null;
  }

  return {
    id: `manifold-${m.id}`,
    platform: "manifold",
    question: m.question,
    category: categorizeByKeywords(m.question) ?? "culture",
    yesPrice: Math.max(0, Math.min(1, m.probability ?? 0.5)),
    volume24h: (m.volume24Hours ?? 0) * VOLUME_DAMPENING,
    liquidity: (m.totalLiquidity ?? 0) * VOLUME_DAMPENING,
    lastUpdated: new Date(),
    sourceUrl: `https://manifold.markets/${m.creatorUsername}/${m.slug}`,
    resolution,
    closeDate: m.closeTime ? new Date(m.closeTime) : null,
  };
}

/**
 * Fetch open Manifold markets sorted by liquidity.
 */
export async function fetchAllManifold(): Promise<NormalizedMarket[]> {
  const url =
    `${BASE_URL}/search-markets?sort=liquidity&limit=${PAGE_LIMIT}&filter=open`;

  try {
    const res = await withRetry(
      () => fetchOrThrow(url, { next: { revalidate: 300 } }),
      { platform: "manifold", endpoint: "/search-markets" },
    );

    const data: ManifoldMarket[] = await res.json();
    return data.map(toNormalized);
  } catch (err) {
    console.error("[manifold] Fetch failed:", err);
    return [];
  }
}

/**
 * PlatformAdapter interface for use in the cron refresh pipeline.
 */
export const manifold: PlatformAdapter = {
  platform: "manifold",
  fetchMarkets: fetchAllManifold,
};
