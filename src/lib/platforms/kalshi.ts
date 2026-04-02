import type { NormalizedMarket, PlatformAdapter } from "@/lib/platforms/types";
import { categorizeByKeywords } from "@/lib/sentiment/categories";
import { withRetry, fetchOrThrow } from "./retry";

const BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";
const PAGE_LIMIT = 200;
const MAX_EVENTS = 200;

/**
 * Raw market nested inside a Kalshi event.
 * All dollar/volume fields are strings (e.g. "0.3400", "2299.00").
 */
interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string;
  yes_bid_dollars: string;
  last_price_dollars: string;
  volume_24h_fp: string;
  volume_fp: string;
  liquidity_dollars: string;
  close_time: string;
  status: string;
  result: string;
  event_ticker: string;
}

interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  markets: KalshiMarket[];
}

interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor: string;
}

function parseDollars(value: string | undefined | null): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function toNormalized(
  market: KalshiMarket,
  event: KalshiEvent,
): NormalizedMarket {
  // Kalshi dollar prices are already 0-1 scale (e.g. "0.34" = 34 cents)
  const yesBid = parseDollars(market.yes_bid_dollars);
  const lastPrice = parseDollars(market.last_price_dollars);
  const yesPrice = yesBid > 0 ? yesBid : lastPrice > 0 ? lastPrice : 0.5;

  // Use event title for categorization — more descriptive than market title
  // for multi-outcome events (e.g. "Who will the next Pope be?")
  const categoryText = event.title || market.title;

  return {
    id: `kalshi-${market.ticker}`,
    platform: "kalshi",
    question: market.title || event.title,
    category: categorizeByKeywords(categoryText) ?? "culture",
    yesPrice: Math.max(0, Math.min(1, yesPrice)),
    volume24h: parseDollars(market.volume_24h_fp),
    liquidity: parseDollars(market.liquidity_dollars),
    lastUpdated: new Date(),
    sourceUrl: `https://kalshi.com/markets/${event.event_ticker}`,
    resolution:
      market.result === "yes" ? "yes" :
      market.result === "no" ? "no" :
      market.status !== "open" ? null :
      undefined,
    closeDate: market.close_time && !isNaN(new Date(market.close_time).getTime()) ? new Date(market.close_time) : null,
  };
}

async function fetchEventsPage(
  cursor?: string,
): Promise<{ events: KalshiEvent[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    status: "open",
    limit: String(PAGE_LIMIT),
    with_nested_markets: "true",
  });
  if (cursor) params.set("cursor", cursor);

  const url = `${BASE_URL}/events?${params}`;

  const res = await withRetry(
    () => fetchOrThrow(url, { next: { revalidate: 300 } }),
    { platform: "kalshi", endpoint: "/events" },
  );

  const data: KalshiEventsResponse = await res.json();

  return {
    events: data.events ?? [],
    nextCursor: data.cursor || null,
  };
}

/**
 * Fetch Kalshi events with nested markets via /events endpoint.
 * This avoids the /markets endpoint which is flooded with auto-generated
 * sports multi-leg parlays that have zero volume.
 *
 * Paginates through events, extracts all nested markets, and filters
 * out markets with no trading activity.
 */
export async function fetchAllKalshi(): Promise<NormalizedMarket[]> {
  const allMarkets: NormalizedMarket[] = [];
  let cursor: string | undefined;
  let eventCount = 0;

  try {
    while (eventCount < MAX_EVENTS) {
      const { events, nextCursor } = await fetchEventsPage(cursor);

      if (events.length === 0) break;
      eventCount += events.length;

      for (const event of events) {
        if (!event.markets || event.markets.length === 0) continue;

        for (const market of event.markets) {
          // Skip markets with no trading activity at all
          const vol = parseDollars(market.volume_fp);
          const vol24h = parseDollars(market.volume_24h_fp);
          const price = parseDollars(market.yes_bid_dollars) ||
                        parseDollars(market.last_price_dollars);

          if (vol === 0 && vol24h === 0 && price === 0) continue;

          allMarkets.push(toNormalized(market, event));
        }
      }

      if (!nextCursor) break;
      cursor = nextCursor;
    }
  } catch (err) {
    console.error("[kalshi] Fetch failed:", err);
  }

  return allMarkets;
}

/**
 * PlatformAdapter interface for use in the cron refresh pipeline.
 */
export const kalshi: PlatformAdapter = {
  platform: "kalshi",
  fetchMarkets: fetchAllKalshi,
};
