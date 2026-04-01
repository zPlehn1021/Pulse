import Anthropic from "@anthropic-ai/sdk";
import type {
  CompositeIndex,
  CategoryAnalysis,
  MarketWithMomentum,
  SignalTension,
} from "@/lib/platforms/types";

// Lazy-init for script compatibility
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Structured insight returned by the AI briefing.
 */
export interface KeyInsight {
  headline: string;
  detail: string;
  layers: string[];
  sentiment: "positive" | "negative" | "mixed" | "neutral";
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
 * Strip markdown formatting artifacts from AI output.
 */
function cleanNarrative(text: string): string {
  return text
    .replace(/^#+\s+.*\n*/gm, "")
    .replace(/\*\*PULSE[^*]*\*\*\s*/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

/**
 * Generate ALL narratives in a SINGLE API call to minimize token usage.
 *
 * Previously: 9 separate calls (6 category + 1 overall + 1 key insights + 1 tension implications)
 * Now: 1 call that returns everything as structured JSON
 *
 * Returns: overall narrative, per-category narratives, key insights, and tension implications.
 */
export async function generateAllNarratives(
  index: CompositeIndex,
): Promise<{
  overall: string;
  categories: Record<string, string>;
  keyInsights: KeyInsight[];
}> {
  try {
    const sl = index.signalLayers;
    const tensions = index.tensions ?? [];

    // Build category context
    const categoryBlocks = index.categories
      .filter((c) => c.marketCount > 0)
      .map((cat) => {
        const marketsText = cat.topMarkets.slice(0, 3).map(formatMarket).join("\n");
        const platformSummary = Object.entries(cat.platformBreakdown)
          .filter(([, v]) => v.marketCount > 0)
          .map(([p, v]) => `${p}: ${v.marketCount}q, avg ${(v.avgPrice * 100).toFixed(0)}%, shift ${v.momentum > 0 ? "+" : ""}${v.momentum}`)
          .join("; ");
        return `  ${cat.category.toUpperCase()} (${cat.marketCount} questions, momentum=${cat.momentum}, uncertainty=${cat.volatility}, engagement=${cat.activity}):
    Platforms: ${platformSummary}
    Top questions:\n${marketsText}`;
      })
      .join("\n\n");

    // Signal layers context
    let signalContext = "";
    if (sl) {
      signalContext = `
SIGNAL LAYERS:
  PREDICTION MARKETS: momentum ${sl.predictionMarkets.momentum}, ${sl.predictionMarkets.marketCount} questions
  ECONOMIC PSYCHOLOGY: Consumer Sentiment ${sl.economicPsychology.consumerSentiment ?? "N/A"} (${sl.economicPsychology.consumerSentimentTrend}), unemployment ${sl.economicPsychology.unemploymentRate ?? "N/A"}%, jobless claims ${sl.economicPsychology.joblessClaimsTrend}, retail ${sl.economicPsychology.retailSalesTrend}, savings ${sl.economicPsychology.savingsRate ?? "N/A"}%
  FEAR SIGNALS: Composite ${sl.fearSignals.composite}/100, VIX ${sl.fearSignals.vix ?? "N/A"} (${sl.fearSignals.vixLevel}), yield ${sl.fearSignals.yieldCurveSpread ?? "N/A"}%${sl.fearSignals.yieldCurveInverted ? " INVERTED" : ""}, gold ${sl.fearSignals.goldTrend}
  PUBLIC ATTENTION: Awareness ${sl.attention.publicAwareness}/100, market gap ${sl.attention.attentionMarketGap}, top: ${sl.attention.topTerms.slice(0, 5).join(", ")}`;
    }

    // Tensions context
    const tensionText = tensions.length > 0
      ? tensions.map((t, i) => `  ${i + 1}. [${t.severity.toUpperCase()}] ${t.description}`).join("\n")
      : "  None detected";

    // Divergences
    const divergenceText = index.divergences.length > 0
      ? index.divergences.slice(0, 3).map((d) =>
          `  "${d.question}" — ${d.highPlatform}: ${d.highPrice}% vs ${d.lowPlatform}: ${d.lowPrice}% (${d.spread}pp gap)`
        ).join("\n")
      : "  None significant";

    const categoryIds = index.categories.filter((c) => c.marketCount > 0).map((c) => c.category);

    const prompt = `You are the lead analyst for PULSE, a societal sentiment research tool that synthesizes prediction markets (${index.totalMarkets} questions across 5 platforms), economic psychology (FRED consumer surveys), fear indicators (VIX, yield curve), and public attention (AI-curated Google Trends).

CURRENT STATE:
Overall: momentum ${index.momentum} (-100 to +100), uncertainty ${index.volatility}/100, engagement ${index.activity}/100
${signalContext}

CATEGORIES:
${categoryBlocks}

CROSS-COMMUNITY DISAGREEMENTS:
${divergenceText}

SIGNAL TENSIONS:
${tensionText}

Generate a complete analysis as a single JSON object with this EXACT structure:
{
  "overall": "3-5 sentence briefing connecting the most important cross-signal patterns. Lead with the most surprising or important finding. Be specific with numbers.",
  "categories": {
    ${categoryIds.map((id) => `"${id}": "2-3 sentence briefing for ${id}"`).join(",\n    ")}
  },
  "keyInsights": [
    {
      "headline": "8-12 word punchy headline",
      "detail": "1-2 sentences connecting data from multiple layers, explaining WHY it matters",
      "layers": ["markets", "economy", "fear", "attention"],
      "sentiment": "positive|negative|mixed|neutral"
    }
  ],
  "tensionImplications": ["1-sentence implication for tension 1", "..."]
}

RULES:
- Frame as collective belief and public experience, NEVER as trading advice
- "73% confidence" = "73% of people believe this will happen"
- Key insights MUST connect multiple signal layers — the most valuable insights are cross-layer
- Generate 3-5 key insights. At least 2 should reference signal tensions if they exist
- Lead overall narrative and first key insight with the single most important finding
- Be authoritative, specific, use exact numbers
- Category narratives: 2-3 sentences each, what the collective believes
- Tension implications: 1 concise sentence each for what the disagreement means
- NEVER use: bullish, bearish, arbitrage, trading, price action, volume, market cap
- Reply with ONLY the JSON object, no other text`;

    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0];
    if (text.type !== "text") {
      return { overall: "", categories: {}, keyInsights: [] };
    }

    // Parse the JSON response
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Narrative: no JSON found in response");
      return { overall: "", categories: {}, keyInsights: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      overall?: string;
      categories?: Record<string, string>;
      keyInsights?: KeyInsight[];
      tensionImplications?: string[];
    };

    // Apply tension implications back to the tension objects
    if (parsed.tensionImplications && tensions.length > 0) {
      for (let i = 0; i < Math.min(tensions.length, parsed.tensionImplications.length); i++) {
        if (typeof parsed.tensionImplications[i] === "string") {
          tensions[i].implication = parsed.tensionImplications[i];
        }
      }
    }

    // Validate key insights
    const keyInsights = (parsed.keyInsights ?? []).filter(
      (i) =>
        typeof i.headline === "string" &&
        typeof i.detail === "string" &&
        Array.isArray(i.layers) &&
        typeof i.sentiment === "string",
    );

    return {
      overall: cleanNarrative(parsed.overall ?? ""),
      categories: parsed.categories ?? {},
      keyInsights,
    };
  } catch (error) {
    console.error("Narrative generation failed:", error);
    return { overall: "", categories: {}, keyInsights: [] };
  }
}
