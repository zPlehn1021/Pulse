/**
 * AI-Curated Attention Terms
 *
 * Uses Claude to dynamically generate Google Trends search terms based on
 * the current state of all signal layers. This creates a feedback loop:
 *   informed money → AI interpretation → public attention measurement → gap analysis
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  getMarkets,
  saveAttentionTerms,
  type AttentionTerm,
} from "@/lib/db/client";
import { computeSignalLayers } from "./signals";
import type { CategoryId } from "@/lib/platforms/types";

// Lazy-init for script compatibility
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const VALID_CATEGORIES = new Set<string>([
  "politics",
  "finance",
  "crypto",
  "tech",
  "culture",
  "geopolitics",
]);

interface CuratedTerm {
  term: string;
  category: string;
  reason: string;
}

/**
 * Gather context from all signal layers for the curation prompt.
 */
function gatherSignalContext(): string {
  // Get top movers from prediction markets (biggest volume, with price data)
  const markets = getMarkets();
  const topMarkets = markets
    .filter((m) => m.platform !== "feargreed" && !m.resolution)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 20);

  const marketsText = topMarkets
    .map(
      (m) =>
        `  [${m.category}] "${m.question}" → ${(m.yesPrice * 100).toFixed(0)}% (${m.platform})`,
    )
    .join("\n");

  // Get signal layer state
  let signalText = "";
  try {
    const layers = computeSignalLayers();
    const ep = layers.economicPsychology;
    const fs = layers.fearSignals;

    signalText = `
Economic Psychology:
  Consumer Sentiment: ${ep.consumerSentiment ?? "N/A"} (trend: ${ep.consumerSentimentTrend})
  Unemployment: ${ep.unemploymentRate ?? "N/A"}%
  Jobless Claims trend: ${ep.joblessClaimsTrend}
  Savings Rate: ${ep.savingsRate ?? "N/A"}%

Fear Signals:
  VIX: ${fs.vix ?? "N/A"} (${fs.vixLevel})
  Yield Curve Spread: ${fs.yieldCurveSpread ?? "N/A"}% (inverted: ${fs.yieldCurveInverted})
  High Yield Spread: ${fs.highYieldSpread ?? "N/A"}%
  Commodity trend: ${fs.goldTrend}`;
  } catch {
    signalText = "  (Signal layer data not yet available)";
  }

  return `Top 20 Prediction Markets (by volume):
${marketsText}

${signalText}`;
}

/**
 * Generate 20 AI-curated search terms based on current signal state.
 * Returns the parsed terms or null if generation fails.
 */
async function generateTerms(): Promise<CuratedTerm[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const context = gatherSignalContext();

  const prompt = `You are an analyst for PULSE, a societal sentiment engine. Given the current signal state below, generate exactly 20 Google search terms that would reveal whether the general public is paying attention to the same issues that prediction markets and economic indicators are tracking.

Current Signal State:
${context}

CRITICAL RULES FOR SEARCH TERMS:
- Each term must be 1-3 words MAX. Think like a normal person typing into Google.
- GOOD examples: "recession", "gas prices", "Bitcoin price", "Iran war", "unemployment", "stock market", "layoffs", "inflation", "AI stocks", "interest rates"
- BAD examples (TOO LONG, will return zero data): "unemployment rising February March 2025", "consumer confidence dropping why", "federal reserve interest rate decision impact"
- NO dates, NO years, NO full sentences, NO question phrases
- These must be real high-volume search terms that millions of people actually type

Other requirements:
- Generate exactly 20 terms
- Distribute across these 6 categories: politics, finance, crypto, tech, culture, geopolitics (at least 2 per category, aim for 3-4 each)
- Focus on topics where prediction markets show strong signals or where economic data suggests public concern

Reply with ONLY a JSON array. Each element must have: "term" (the search query, 1-3 words), "category" (one of the 6 categories), "reason" (1 sentence explaining why this term matters right now).

Example format:
[{"term": "bank run", "category": "finance", "reason": "Prediction markets pricing banking stress at 40%"}, ...]`;

  let response;
  try {
    response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    console.error("Attention term generation API call failed:", err);
    return null;
  }

  const text = response.content[0];
  if (text.type !== "text") return null;

  try {
    // Extract JSON array from response (handle potential markdown wrapping)
    const jsonMatch = text.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      term?: string;
      category?: string;
      reason?: string;
    }>;

    // Validate and filter
    const terms: CuratedTerm[] = [];
    for (const item of parsed) {
      if (
        item.term &&
        item.category &&
        VALID_CATEGORIES.has(item.category) &&
        typeof item.term === "string" &&
        item.term.length > 0 &&
        item.term.length <= 100
      ) {
        terms.push({
          term: item.term,
          category: item.category,
          reason: item.reason || "",
        });
      }
    }

    return terms.length > 0 ? terms.slice(0, 25) : null; // cap at 25 in case AI is generous
  } catch {
    console.error("Failed to parse curated terms JSON");
    return null;
  }
}

/**
 * Run the full term curation pipeline:
 * 1. Generate terms via Claude
 * 2. Save to attention_terms table
 *
 * Returns the number of terms generated, or 0 if skipped/failed.
 */
export async function curateAttentionTerms(): Promise<number> {
  const terms = await generateTerms();
  if (!terms || terms.length === 0) return 0;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hour TTL

  const dbTerms: AttentionTerm[] = terms.map((t) => ({
    term: t.term,
    category: t.category,
    generatedReason: t.reason,
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    trendValue: null,
    trendFetchedAt: null,
  }));

  try {
    saveAttentionTerms(dbTerms);
  } catch (err) {
    console.error("Failed to save attention terms to DB:", err);
    return 0;
  }
  return dbTerms.length;
}
