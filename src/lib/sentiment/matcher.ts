import type {
  NormalizedMarket,
  Divergence,
  Platform,
} from "@/lib/platforms/types";

/**
 * Cross-community belief matcher.
 *
 * Finds questions on different platforms that ask about the same event,
 * then compares confidence levels to detect where communities disagree.
 *
 * Approach: tokenize question text, compute Jaccard similarity between
 * pairs of questions on different platforms. Questions with similarity > 0.35
 * are considered matches.
 */

const MIN_SIMILARITY = 0.35;
const MIN_SPREAD_PP = 5; // minimum spread in percentage points to flag

// Words that appear in almost every question and dilute matching
const STOP_WORDS = new Set([
  "will", "the", "be", "of", "a", "an", "in", "to", "by", "on", "at",
  "or", "and", "is", "for", "it", "this", "that", "with", "from", "as",
  "are", "was", "were", "has", "have", "had", "do", "does", "did",
  "not", "no", "yes", "if", "would", "could", "should", "can",
  "before", "after", "than", "more", "less", "above", "below",
  "any", "all", "each", "every",
]);

/**
 * Tokenize a question into meaningful words.
 * Strips punctuation, lowercases, removes stop words.
 */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s$%]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface MatchCandidate {
  market: NormalizedMarket;
  tokens: Set<string>;
}

/**
 * Find cross-platform matches and compute divergences.
 *
 * Only considers questions with active participation.
 * Groups matches by similar questions, picks the pair with the
 * largest belief gap.
 */
export function matchMarketsAcrossPlatforms(
  allMarkets: NormalizedMarket[],
): Divergence[] {
  // Only match real prediction markets (exclude indices and low-liquidity noise)
  // Play-money markets need higher volume threshold to be meaningful
  const matchable = allMarkets.filter((m) => {
    if (m.platform === "feargreed" || m.resolution !== undefined) return false;
    if (m.volume24h <= 0) return false;
    // Play-money platforms need $1k+ volume equivalent to be meaningful
    if (m.platform === "manifold" && m.volume24h < 1000) return false;
    return true;
  });

  // Pre-tokenize all markets
  const candidates: MatchCandidate[] = matchable.map((m) => ({
    market: m,
    tokens: tokenize(m.question),
  }));

  // Group by platform for efficient cross-platform comparison
  const byPlatform = new Map<Platform, MatchCandidate[]>();
  for (const c of candidates) {
    const list = byPlatform.get(c.market.platform) || [];
    list.push(c);
    byPlatform.set(c.market.platform, list);
  }

  const platforms = [...byPlatform.keys()];
  const matches: Divergence[] = [];
  const matched = new Set<string>(); // prevent duplicate matches

  // Compare every pair of platforms
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const listA = byPlatform.get(platforms[i])!;
      const listB = byPlatform.get(platforms[j])!;

      // For efficiency, only compare top markets by volume (cap at 100 per platform)
      const topA = listA
        .sort((a, b) => b.market.volume24h - a.market.volume24h)
        .slice(0, 100);
      const topB = listB
        .sort((a, b) => b.market.volume24h - a.market.volume24h)
        .slice(0, 100);

      for (const a of topA) {
        for (const b of topB) {
          // Same category speeds up matching and reduces false positives
          if (a.market.category !== b.market.category) continue;

          const sim = jaccard(a.tokens, b.tokens);
          if (sim < MIN_SIMILARITY) continue;

          const matchKey = [a.market.id, b.market.id].sort().join("|");
          if (matched.has(matchKey)) continue;
          matched.add(matchKey);

          const spreadPP =
            Math.abs(a.market.yesPrice - b.market.yesPrice) * 100;
          if (spreadPP < MIN_SPREAD_PP) continue;

          const [high, low] =
            a.market.yesPrice >= b.market.yesPrice
              ? [a.market, b.market]
              : [b.market, a.market];

          matches.push({
            category: a.market.category,
            question: high.question.length > low.question.length
              ? low.question
              : high.question,
            spread: Math.round(spreadPP),
            highPlatform: high.platform,
            highPrice: Math.round(high.yesPrice * 100),
            lowPlatform: low.platform,
            lowPrice: Math.round(low.yesPrice * 100),
          });
        }
      }
    }
  }

  // Sort by spread descending — biggest disagreements first
  matches.sort((a, b) => b.spread - a.spread);

  // Deduplicate: prevent the same event appearing multiple times due
  // to variant contracts (e.g., "Dem wins House" vs "Rep wins House").
  // Two divergences are dupes if:
  //   (a) same platform pair + similar question (jaccard > 0.4), OR
  //   (b) very similar question text regardless of platforms (jaccard > 0.6)
  const deduped: Divergence[] = [];
  for (const m of matches) {
    const mTokens = tokenize(m.question);
    const platformPair = [m.highPlatform, m.lowPlatform].sort().join("|");
    const isDupe = deduped.some((existing) => {
      const eTokens = tokenize(existing.question);
      const sim = jaccard(mTokens, eTokens);
      const samePair =
        [existing.highPlatform, existing.lowPlatform].sort().join("|") === platformPair;
      return (samePair && sim > 0.4) || sim > 0.6;
    });
    if (!isDupe) deduped.push(m);
  }

  return deduped;
}
