/**
 * Google Trends Adapter
 *
 * Fetches search interest data for AI-curated attention terms.
 * Uses the google-trends-api npm package.
 *
 * Rate limiting: Google Trends is aggressive with rate limits.
 * We batch terms into groups of 5 (the max Google Trends can compare at once)
 * and add delays between batches.
 */

// google-trends-api is a CJS module
import googleTrends from "google-trends-api";
import {
  getLatestAttentionTerms,
  updateAttentionTrendValues,
  type AttentionTerm,
} from "@/lib/db/client";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface TrendTimelinePoint {
  time: string;
  value: number[];
}

interface TrendResult {
  default: {
    timelineData: TrendTimelinePoint[];
  };
}

/**
 * Fetch Google Trends interest data for a batch of up to 5 terms.
 * Returns a map of term → interest score (0-100).
 */
async function fetchTrendsBatch(
  terms: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (terms.length === 0) return result;

  try {
    // Fetch interest over the last 7 days for relative comparison
    const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const response = await googleTrends.interestOverTime({
      keyword: terms,
      startTime,
      geo: "US",
    });

    // Detect HTML rate-limit responses before attempting JSON.parse
    const trimmed = typeof response === "string" ? response.trimStart() : "";
    if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
      console.warn(
        `Google Trends rate-limited for batch [${terms.join(", ")}] — got HTML response`,
      );
      // Return null values so these terms get retried next cycle instead of stored as 0
      return result; // empty map — caller will skip these terms
    }

    const data = JSON.parse(response) as TrendResult;
    const timeline = data.default?.timelineData;

    if (!timeline || timeline.length === 0) {
      // No data — set all to 0
      for (const term of terms) result.set(term, 0);
      return result;
    }

    // Get the most recent data point's values
    const latest = timeline[timeline.length - 1];
    for (let i = 0; i < terms.length; i++) {
      const value = latest.value[i] ?? 0;
      result.set(terms[i], value);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Check if the error is a rate limit (JSON parse failure on HTML)
    if (errMsg.includes("Unexpected token") || errMsg.includes("<")) {
      console.warn(
        `Google Trends rate-limited for batch [${terms.join(", ")}] — parse error suggests HTML response`,
      );
      // Return empty map so terms are skipped (not stored as 0)
      return result;
    }
    console.error(
      `Google Trends fetch failed for batch [${terms.join(", ")}]:`,
      errMsg,
    );
    // On failure, set all to 0 rather than crashing
    for (const term of terms) result.set(term, 0);
  }

  return result;
}

/**
 * Fetch Google Trends data for all active attention terms.
 * Batches into groups of 5 with delays to respect rate limits.
 *
 * Returns the number of terms updated.
 */
export async function fetchTrendsForAttentionTerms(): Promise<number> {
  const terms = getLatestAttentionTerms();
  if (terms.length === 0) return 0;

  // Only fetch for terms that haven't been fetched yet
  const unfetched = terms.filter((t) => t.trendValue === null && t.id);
  if (unfetched.length === 0) return 0;

  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 5000; // 5s between batches to avoid rate limits
  const updates: { id: number; trendValue: number }[] = [];

  for (let i = 0; i < unfetched.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = unfetched.slice(i, i + BATCH_SIZE);
    const batchTerms = batch.map((t) => t.term);
    const results = await fetchTrendsBatch(batchTerms);

    for (const term of batch) {
      // Only store values for terms that were actually returned.
      // Rate-limited batches return an empty map — skip those terms
      // so they remain unfetched and get retried next cycle.
      if (results.has(term.term)) {
        updates.push({ id: term.id!, trendValue: results.get(term.term)! });
      }
    }
  }

  if (updates.length > 0) {
    updateAttentionTrendValues(updates);
  }

  return updates.length;
}

/**
 * Compute attention scores from the latest fetched terms.
 * Returns per-category scores and top terms.
 */
export function computeAttentionScores(terms: AttentionTerm[]): {
  overall: number;
  byCategory: Record<string, number>;
  topTerms: { term: string; category: string; value: number }[];
} {
  const fetched = terms.filter((t) => t.trendValue !== null);
  if (fetched.length === 0) {
    return { overall: 0, byCategory: {}, topTerms: [] };
  }

  // Overall: average interest across all terms
  const overall = Math.round(
    fetched.reduce((s, t) => s + (t.trendValue ?? 0), 0) / fetched.length,
  );

  // Per-category averages
  const byCategory: Record<string, number> = {};
  const catGroups = new Map<string, number[]>();
  for (const t of fetched) {
    if (!catGroups.has(t.category)) catGroups.set(t.category, []);
    catGroups.get(t.category)!.push(t.trendValue ?? 0);
  }
  for (const [cat, values] of catGroups) {
    byCategory[cat] = Math.round(
      values.reduce((s, v) => s + v, 0) / values.length,
    );
  }

  // Top 5 terms by interest
  const topTerms = [...fetched]
    .sort((a, b) => (b.trendValue ?? 0) - (a.trendValue ?? 0))
    .slice(0, 5)
    .map((t) => ({
      term: t.term,
      category: t.category,
      value: t.trendValue ?? 0,
    }));

  return { overall, byCategory, topTerms };
}
