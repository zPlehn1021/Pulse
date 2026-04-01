import Anthropic from "@anthropic-ai/sdk";
import type {
  CompositeIndex,
  CategoryAnalysis,
  MarketWithMomentum,
  Divergence,
  SignalTension,
} from "@/lib/platforms/types";

// Lazy-init for script compatibility
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

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

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0];
    return text.type === "text" ? cleanNarrative(text.text) : "";
  } catch (err) {
    console.error(`Category narrative failed for ${cat.category}:`, err);
    return "";
  }
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

  // Signal layers context
  let signalContext = "";
  if (index.signalLayers) {
    const sl = index.signalLayers;
    signalContext = `
Signal layers:
  Economic Psychology: Consumer Sentiment ${sl.economicPsychology.consumerSentiment ?? "N/A"} (trend: ${sl.economicPsychology.consumerSentimentTrend}), confidence: ${sl.economicPsychology.confidence}%
  Fear Signals: Composite ${sl.fearSignals.composite}/100, VIX ${sl.fearSignals.vix ?? "N/A"} (${sl.fearSignals.vixLevel}), yield curve ${sl.fearSignals.yieldCurveInverted ? "INVERTED" : "normal"} at ${sl.fearSignals.yieldCurveSpread ?? "N/A"}%
  Public Attention: Awareness ${sl.attention.publicAwareness}/100, attention-market gap ${sl.attention.attentionMarketGap}`;
  }

  // Tensions context
  const tensions = index.tensions ?? [];
  const tensionText =
    tensions.length > 0
      ? tensions
          .slice(0, 5)
          .map((t) => `  [${t.severity.toUpperCase()}] ${t.description}`)
          .join("\n")
      : "  No significant cross-layer tensions detected.";

  const prompt = `You are the lead analyst for PULSE, a societal sentiment research tool. PULSE synthesizes four signal layers — prediction markets (${index.totalMarkets} questions across 5 platforms), economic psychology (consumer surveys), fear indicators (VIX, yield curve), and public attention (AI-curated Google Trends) — into a unified picture of how society feels about the future.

Write a 3-5 sentence briefing summarizing what the collective believes right now and where the signals disagree.

Overall sentiment:
  Direction: ${index.momentum} (-100=growing pessimism, 0=stable, +100=growing optimism)
  Uncertainty: ${index.volatility}/100 (how much beliefs are in flux)
  Engagement: ${index.activity}/100 (how actively people are weighing in)
  Total questions tracked: ${index.totalMarkets}
${signalContext}

Category breakdown:
${categorySummaries}

Cross-community disagreements (same question, different beliefs):
${divergenceText}

Cross-layer signal tensions (disagreements BETWEEN signal types):
${tensionText}

Rules:
- This is a societal sentiment tool, NOT a trading dashboard. Frame everything as collective belief, public expectation, and shifts in how people feel.
- Probabilities = confidence levels. "17% on Iran" means "only 17% of people believe this will happen."
- Divergences = communities that see the world differently.
- Signal tensions are the most interesting insight — when prediction markets, consumer sentiment, fear indicators, and public attention disagree, something important may be unfolding. If tensions exist, weave them into the narrative.
- Lead with the most significant shift or tension
- Be authoritative and specific. Use exact numbers.
- 3-5 sentences maximum. No bullet points, no headers.
- Never use the words: bullish, bearish, arbitrage, trading, price action, volume`;

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0];
    return text.type === "text" ? cleanNarrative(text.text) : "";
  } catch (err) {
    console.error("Overall narrative generation failed:", err);
    return "";
  }
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
 * Generate AI implications for detected signal tensions.
 * Batches all tensions into a single API call for efficiency.
 */
async function generateTensionImplications(
  tensions: SignalTension[],
): Promise<void> {
  if (tensions.length === 0) return;

  const tensionDescriptions = tensions
    .map((t, i) => `${i + 1}. [${t.severity}] ${t.description}`)
    .join("\n");

  const prompt = `You are a societal sentiment analyst. For each signal tension below, write a brief 1-sentence implication — what might this disagreement mean for society? Frame as collective belief and public experience, not as financial advice.

Signal tensions:
${tensionDescriptions}

Reply with ONLY a JSON array of strings, one implication per tension, in the same order. Each should be 1 concise sentence.
Example: ["Implication for tension 1", "Implication for tension 2"]`;

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0];
    if (text.type !== "text") return;

    const jsonMatch = text.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const implications = JSON.parse(jsonMatch[0]) as string[];
    for (let i = 0; i < Math.min(tensions.length, implications.length); i++) {
      if (typeof implications[i] === "string") {
        tensions[i].implication = implications[i];
      }
    }
  } catch (err) {
    console.error("Tension implication generation failed:", err);
  }
}

/**
 * Generate all narratives for a composite index.
 * Runs category narratives in parallel, then the overall briefing.
 * Also generates AI implications for any detected tensions.
 */
export async function generateAllNarratives(
  index: CompositeIndex,
): Promise<{
  overall: string;
  categories: Record<string, string>;
}> {
  try {
    // Generate category narratives + tension implications in parallel
    const [categoryResults] = await Promise.all([
      Promise.allSettled(
        index.categories
          .filter((c) => c.marketCount > 0)
          .map(async (cat) => ({
            category: cat.category,
            narrative: await generateCategoryNarrative(cat),
          })),
      ),
      generateTensionImplications(index.tensions ?? []),
    ]);

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
