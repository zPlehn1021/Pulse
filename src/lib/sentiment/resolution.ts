/**
 * Resolution Monitor
 *
 * Detects newly resolved prediction markets and creates resolution records
 * with signal state snapshots. Over time, this builds PULSE's track record
 * of what every signal said vs. what actually happened.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  getNewlyResolvedMarkets,
  saveResolution,
  getMarketPriceAt,
  type ResolutionRecord,
} from "@/lib/db/client";
import { computeSignalLayers } from "./signals";
import { getLatestAttentionTerms } from "@/lib/db/client";
import { computeAttentionScores } from "@/lib/platforms/trends";

// Lazy-init for script compatibility
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Build a signal snapshot JSON blob for the current moment.
 * Used to record what all signals were saying at resolution time.
 */
function buildSignalSnapshot(
  marketId: string,
  yesPrice: number,
  sentimentDirection: string | null,
): string {
  const snapshot: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    prediction_markets: {
      market_id: marketId,
      yes_price: yesPrice,
      sentiment_direction: sentimentDirection,
    },
  };

  // Add economic and fear signal state
  try {
    const layers = computeSignalLayers();

    snapshot.economic_psychology = {
      consumer_sentiment: layers.economicPsychology.consumerSentiment,
      consumer_sentiment_trend: layers.economicPsychology.consumerSentimentTrend,
      unemployment_rate: layers.economicPsychology.unemploymentRate,
      jobless_claims_trend: layers.economicPsychology.joblessClaimsTrend,
      savings_rate: layers.economicPsychology.savingsRate,
    };

    snapshot.fear_signals = {
      vix: layers.fearSignals.vix,
      vix_level: layers.fearSignals.vixLevel,
      yield_curve_spread: layers.fearSignals.yieldCurveSpread,
      yield_curve_inverted: layers.fearSignals.yieldCurveInverted,
      composite: layers.fearSignals.composite,
    };
  } catch {
    // Signal data not available — that's fine
  }

  // Add attention state
  try {
    const attentionTerms = getLatestAttentionTerms();
    const attention = computeAttentionScores(attentionTerms);
    snapshot.attention = {
      public_awareness: attention.overall,
      top_terms: attention.topTerms.map((t) => t.term),
    };
  } catch {
    // Attention data not available
  }

  return JSON.stringify(snapshot);
}

/**
 * Build a historical signal snapshot using price history.
 * Returns null if no price data exists for the requested time.
 */
function buildHistoricalSnapshot(
  marketId: string,
  hoursAgo: number,
  sentimentDirection: string | null,
): string | null {
  const historicalPrice = getMarketPriceAt(marketId, hoursAgo);
  if (historicalPrice === null) return null;

  return JSON.stringify({
    timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
    prediction_markets: {
      market_id: marketId,
      yes_price: historicalPrice,
      sentiment_direction: sentimentDirection,
    },
    // Note: we only have price history, not historical signal layer state.
    // Over time, with more snapshots stored, this could be enriched.
  });
}

/**
 * Determine if the prediction market was "correct" based on outcome.
 * A market was correct if it had >50% confidence and the outcome matched,
 * or <50% confidence and the outcome didn't match.
 */
function scorePrediction(
  yesPrice: number,
  outcome: string,
): { correct: number; confidence: number } {
  const predictedYes = yesPrice > 0.5;
  const actualYes = outcome === "yes";
  const correct = predictedYes === actualYes ? 1 : 0;
  // Confidence = how far from 50% the market was
  const confidence = Math.round(yesPrice * 100) / 100;
  return { correct, confidence };
}

/**
 * Score how the consumer sentiment signal aligned with the outcome.
 */
function scoreConsumerSentiment(
  sentimentDirection: string | null,
  outcome: string,
): string | null {
  // If the market was classified as "positive" and resolved "yes",
  // consumer sentiment rising = aligned
  // If "negative" and resolved "yes", sentiment falling = aligned
  // Without full historical sentiment data, we use current state as proxy
  try {
    const layers = computeSignalLayers();
    const trend = layers.economicPsychology.consumerSentimentTrend;

    if (sentimentDirection === "positive") {
      if (outcome === "yes" && trend === "rising") return "aligned";
      if (outcome === "no" && trend === "falling") return "aligned";
      return "misaligned";
    }
    if (sentimentDirection === "negative") {
      if (outcome === "yes" && trend === "falling") return "aligned";
      if (outcome === "no" && trend === "rising") return "aligned";
      return "misaligned";
    }
    return "neutral";
  } catch {
    return null;
  }
}

/**
 * Score how fear signals aligned with the outcome.
 */
function scoreFearSignals(
  sentimentDirection: string | null,
  outcome: string,
): string | null {
  try {
    const layers = computeSignalLayers();
    const fearHigh = layers.fearSignals.composite > 60;

    // For negative markets (e.g., "Will there be a recession?"):
    //   High fear + resolved yes = aligned
    //   Low fear + resolved no = aligned
    if (sentimentDirection === "negative") {
      if (outcome === "yes" && fearHigh) return "aligned";
      if (outcome === "no" && !fearHigh) return "aligned";
      return "misaligned";
    }
    // For positive markets:
    //   Low fear + resolved yes = aligned
    if (sentimentDirection === "positive") {
      if (outcome === "yes" && !fearHigh) return "aligned";
      if (outcome === "no" && fearHigh) return "aligned";
      return "misaligned";
    }
    return "neutral";
  } catch {
    return null;
  }
}

/**
 * Score the public attention level at resolution time.
 */
function scoreAttentionLevel(): string | null {
  try {
    const terms = getLatestAttentionTerms();
    const scores = computeAttentionScores(terms);
    if (scores.overall >= 60) return "high";
    if (scores.overall >= 30) return "medium";
    return "low";
  } catch {
    return null;
  }
}

/**
 * Generate an AI retrospective for a significant resolution.
 */
async function generateRetrospective(
  market: { question: string; category: string; resolution: string; yesPrice: number },
  signalsAtResolution: string | null,
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  let signalContext = "No signal layer data available at resolution time.";
  if (signalsAtResolution) {
    try {
      const parsed = JSON.parse(signalsAtResolution);
      signalContext = JSON.stringify(parsed, null, 2);
    } catch {
      // Use raw string
      signalContext = signalsAtResolution;
    }
  }

  const prompt = `You are a retrospective analyst for PULSE, a societal sentiment engine. A prediction market has just resolved. Analyze what the signals were saying and write a brief retrospective.

Market: "${market.question}"
Category: ${market.category}
Final confidence: ${(market.yesPrice * 100).toFixed(0)}%
Outcome: ${market.resolution.toUpperCase()}

Signal state at resolution:
${signalContext}

Write 2-3 sentences analyzing:
1. Was the prediction market's confidence level appropriate for the outcome?
2. Were any other signals (consumer sentiment, fear indicators, public attention) aligned or misaligned with the outcome?

Be concise and factual. Frame as societal belief analysis, not trading.`;

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0];
    return text.type === "text" ? text.text.trim() : null;
  } catch (err) {
    console.error("Retrospective generation failed:", err);
    return null;
  }
}

/**
 * Process all newly resolved markets:
 * 1. Detect markets with resolution = 'yes'/'no' that lack resolution records
 * 2. Build signal snapshots at various time intervals
 * 3. Score prediction accuracy and signal alignment
 * 4. Generate AI retrospectives for significant resolutions
 * 5. Save resolution records
 *
 * Returns the number of resolutions processed.
 */
export async function processNewResolutions(): Promise<number> {
  let newlyResolved;
  try {
    newlyResolved = getNewlyResolvedMarkets();
  } catch (err) {
    console.error("Failed to query newly resolved markets:", err);
    return 0;
  }
  if (newlyResolved.length === 0) return 0;

  let processed = 0;

  for (const market of newlyResolved) {
    try {
      // Build signal snapshots
      const signalsAtResolution = buildSignalSnapshot(
        market.id,
        market.yesPrice,
        market.sentimentDirection,
      );

      // Historical snapshots from price data (may be null if no history)
      const signals1d = buildHistoricalSnapshot(market.id, 24, market.sentimentDirection);
      const signals7d = buildHistoricalSnapshot(market.id, 168, market.sentimentDirection);
      const signals30d = buildHistoricalSnapshot(market.id, 720, market.sentimentDirection);

      // Score the prediction
      const { correct, confidence } = scorePrediction(market.yesPrice, market.resolution);

      // Score signal alignment
      const consumerDirection = scoreConsumerSentiment(
        market.sentimentDirection,
        market.resolution,
      );
      const fearDirection = scoreFearSignals(
        market.sentimentDirection,
        market.resolution,
      );
      const attentionLevel = scoreAttentionLevel();

      // Generate AI retrospective for significant markets
      // (only for markets that had meaningful confidence, not 50/50)
      let retrospective: string | null = null;
      if (Math.abs(market.yesPrice - 0.5) > 0.15) {
        retrospective = await generateRetrospective(
          market,
          signalsAtResolution,
        );
      }

      const record: ResolutionRecord = {
        marketId: market.id,
        eventType: "market_resolution",
        eventDescription: market.question,
        category: market.category,
        outcome: market.resolution,
        resolvedAt: new Date().toISOString(),
        signals30d,
        signals7d,
        signals1d,
        signalsAtResolution,
        predictionMarketCorrect: correct,
        pmConfidenceAtClose: confidence,
        consumerSentimentDirection: consumerDirection,
        fearSignalsDirection: fearDirection,
        attentionLevel,
        aiRetrospective: retrospective,
        createdAt: new Date().toISOString(),
      };

      saveResolution(record);
      processed++;
    } catch (err) {
      console.error(`Resolution processing failed for market ${market.id}:`, err);
      // Continue processing other markets
    }
  }

  return processed;
}
