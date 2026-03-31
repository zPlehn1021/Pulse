import Anthropic from "@anthropic-ai/sdk";
import type {
  CompositeIndex,
  CategoryAnalysis,
  MarketWithMomentum,
  Divergence,
} from "@/lib/platforms/types";

const client = new Anthropic();

/**
 * Format a market for the AI prompt.
 */
function formatMarket(m: MarketWithMomentum): string {
  const probability = `${(m.yesPrice * 100).toFixed(0)}%`;
  const shift =
    m.delta24h !== 0
      ? ` (${m.delta24h > 0 ? "+" : ""}${(m.delta24h * 100).toFixed(1)}pp shift)`
      : "";
  return `  - [${m.platform}] "${m.question}" → ${probability} confidence${shift}`;
}

/**
 * Generate a narrative briefing for a single category.
 */
export async function generateCategoryNarrative(
  cat: CategoryAnalysis,
): Promise<string> {
  const marketsText = cat.topMarkets.map(formatMarket).join("\n");

  const platformSummary = Object.entries(cat.platformBreakdown)
    .filter(([, v]) => v.marketCount > 0)
    .map(
      ([p, v]) =>
        `${p}: ${v.marketCount} questions, avg confidence ${(v.avgPrice * 100).toFixed(0)}%, sentiment shift ${v.momentum > 0 ? "+" : ""}${v.momentum}`,
    )
    .join("\n  ");

  const prompt = `You are a sentiment analyst for PULSE, a tool that tracks collective public belief and sentiment by analyzing prediction markets as a proxy for how people feel about the future.

Analyze the following ${cat.category} data and write a 2-3 sentence briefing about what the collective believes.

Category: ${cat.category}
Questions tracked: ${cat.marketCount}
Sentiment direction: ${cat.momentum} (-100=growing pessimism, 0=stable, +100=growing optimism)
Uncertainty: ${cat.volatility}/100 (how much beliefs are shifting)
Engagement: ${cat.activity}/100 (how many people are weighing in)

Platform breakdown:
  ${platformSummary}

Most-watched questions:
${marketsText}

Rules:
- Frame everything as what people believe, expect, or feel — not as market movements or price action
- "73% confidence" means "73% of people believe this will happen", not a price
- Shifts in probability = shifts in collective belief. A +5pp shift means people are becoming more convinced.
- If sentiment is near 0 and uncertainty is low, say beliefs are stable and settled
- Highlight where belief is strongest, weakest, or changing fastest
- Be concise, factual, and specific. No filler words.
- Write 2-3 sentences maximum. Do NOT use bullet points or headers.
- Never use the words: bullish, bearish, arbitrage, trading, price, volume, market cap`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0];
  return text.type === "text" ? cleanNarrative(text.text) : "";
}

/**
 * Generate the top-level dashboard briefing across all categories.
 */
export async function generateOverallNarrative(
  index: CompositeIndex,
): Promise<string> {
  const categorySummaries = index.categories
    .filter((c) => c.marketCount > 0)
    .map((c) => {
      const topQuestion = c.topMarkets[0];
      const topLine = topQuestion
        ? `Most-watched: "${topQuestion.question}" at ${(topQuestion.yesPrice * 100).toFixed(0)}% confidence`
        : "";
      return `  ${c.category}: sentiment=${c.momentum}, uncertainty=${c.volatility}, engagement=${c.activity}, ${c.marketCount} questions. ${topLine}`;
    })
    .join("\n");

  const divergenceText =
    index.divergences.length > 0
      ? index.divergences
          .slice(0, 5)
          .map(
            (d) =>
              `  "${d.question}" — ${d.highPlatform} community: ${d.highPrice}% vs ${d.lowPlatform} community: ${d.lowPrice}% (${d.spread}pp disagreement)`,
          )
          .join("\n")
      : "  No significant cross-community disagreements detected.";

  const prompt = `You are the lead analyst for PULSE, a societal sentiment research tool. PULSE tracks collective public belief about the future by analyzing ${index.totalMarkets} prediction market questions across 5 platforms (Polymarket, Kalshi, Manifold, PredictIt, Fear & Greed Index). Each platform represents a different community of people expressing what they believe will happen.

Write a 3-4 sentence briefing summarizing what the collective believes right now about the world.

Overall sentiment:
  Direction: ${index.momentum} (-100=growing pessimism, 0=stable, +100=growing optimism)
  Uncertainty: ${index.volatility}/100 (how much beliefs are in flux)
  Engagement: ${index.activity}/100 (how actively people are weighing in)
  Total questions tracked: ${index.totalMarkets}

Category breakdown:
${categorySummaries}

Cross-community disagreements (same question, different beliefs):
${divergenceText}

Rules:
- This is a societal sentiment tool, NOT a trading dashboard. Frame everything as collective belief, public expectation, and shifts in how people feel.
- Probabilities = confidence levels. "17% on Iran" means "only 17% of people believe this will happen."
- Divergences = communities that see the world differently. "PredictIt 86% vs Kalshi 2%" means those communities have fundamentally different beliefs about the same event.
- Lead with the most significant shift in collective belief
- Highlight where different communities disagree most strongly
- Be authoritative and specific. Use exact percentages and question names.
- 3-4 sentences maximum. No bullet points, no headers.
- Never use the words: bullish, bearish, arbitrage, trading, price action, volume`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0];
  return text.type === "text" ? cleanNarrative(text.text) : "";
}

/**
 * Strip markdown formatting artifacts from AI output.
 */
function cleanNarrative(text: string): string {
  return text
    .replace(/^#+\s+.*\n*/gm, "") // remove markdown headers
    .replace(/\*\*PULSE[^*]*\*\*\s*/g, "") // remove "**PULSE Brief: ...**" labels
    .replace(/\*\*/g, "") // remove remaining bold markers
    .trim();
}

/**
 * Generate all narratives for a composite index.
 * Runs category narratives in parallel, then the overall briefing.
 */
export async function generateAllNarratives(
  index: CompositeIndex,
): Promise<{
  overall: string;
  categories: Record<string, string>;
}> {
  try {
    // Generate category narratives in parallel
    const categoryResults = await Promise.allSettled(
      index.categories
        .filter((c) => c.marketCount > 0)
        .map(async (cat) => ({
          category: cat.category,
          narrative: await generateCategoryNarrative(cat),
        })),
    );

    const categories: Record<string, string> = {};
    for (const result of categoryResults) {
      if (result.status === "fulfilled") {
        categories[result.value.category] = result.value.narrative;
      }
    }

    // Attach category narratives to the index for the overall briefing
    for (const cat of index.categories) {
      if (categories[cat.category]) {
        cat.narrative = categories[cat.category];
      }
    }

    // Generate overall briefing
    const overall = await generateOverallNarrative(index);

    return { overall, categories };
  } catch (error) {
    console.error("Narrative generation failed:", error);
    return { overall: "", categories: {} };
  }
}
