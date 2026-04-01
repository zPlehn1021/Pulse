/**
 * Cross-Layer Signal Tension Detection
 *
 * Detects disagreements between the four signal layers:
 *   1. Prediction markets (what informed bettors believe)
 *   2. Economic psychology (how consumers feel)
 *   3. Fear signals (acute anxiety indicators)
 *   4. Attention (what the public is searching for)
 *
 * Tensions are the unique insight PULSE provides — when signals disagree,
 * something interesting is happening.
 */

import type { SignalTension, SignalLayersData } from "@/lib/platforms/types";

interface TensionInput {
  signalLayers: SignalLayersData;
  overallMomentum: number;
  overallActivity: number;
}

/**
 * Detect cross-layer signal tensions from the current signal state.
 * Returns an array of detected tensions, sorted by severity.
 */
export function detectTensions(input: TensionInput): SignalTension[] {
  const { signalLayers, overallMomentum, overallActivity } = input;
  const tensions: SignalTension[] = [];
  const ep = signalLayers.economicPsychology;
  const fs = signalLayers.fearSignals;
  const attn = signalLayers.attention;
  const pm = signalLayers.predictionMarkets;

  // --- Rule 1: Markets bearish but consumers still confident ---
  // Prediction markets shifting negative while consumer sentiment is still high
  if (
    pm.momentum < -15 &&
    ep.consumerSentiment !== null &&
    ep.consumerSentiment > 65 &&
    ep.confidence > 30
  ) {
    tensions.push({
      description:
        `Prediction markets shifting pessimistic (momentum ${pm.momentum}) but consumer sentiment remains elevated at ${ep.consumerSentiment}`,
      severity: ep.consumerSentiment > 80 ? "high" : "medium",
      layers: ["predictionMarkets", "economicPsychology"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 2: Markets bullish but consumers pessimistic ---
  if (
    pm.momentum > 15 &&
    ep.consumerSentiment !== null &&
    ep.consumerSentiment < 55 &&
    ep.confidence > 30
  ) {
    tensions.push({
      description:
        `Prediction markets are optimistic (momentum +${pm.momentum}) but consumer sentiment is depressed at ${ep.consumerSentiment}`,
      severity: ep.consumerSentiment < 45 ? "high" : "medium",
      layers: ["predictionMarkets", "economicPsychology"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 3: Fear signals elevated but prediction markets calm ---
  if (
    fs.composite > 60 &&
    Math.abs(pm.momentum) < 10 &&
    fs.confidence > 30
  ) {
    tensions.push({
      description:
        `Fear indicators elevated (composite ${fs.composite}/100, VIX ${fs.vix ?? "N/A"}) but prediction markets show no strong directional move`,
      severity: fs.composite > 75 ? "high" : "medium",
      layers: ["fearSignals", "predictionMarkets"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 4: Fear signals calm but markets volatile ---
  if (
    fs.composite < 30 &&
    Math.abs(pm.momentum) > 25 &&
    fs.confidence > 30
  ) {
    tensions.push({
      description:
        `Fear indicators calm (composite ${fs.composite}/100) but prediction markets are moving sharply (momentum ${pm.momentum})`,
      severity: Math.abs(pm.momentum) > 40 ? "high" : "medium",
      layers: ["fearSignals", "predictionMarkets"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 5: High attention-market gap ---
  // Public is either way more or way less aware than market activity suggests
  if (attn.attentionMarketGap > 40 && attn.confidence > 20) {
    const publicHigher = attn.publicAwareness > overallActivity;
    tensions.push({
      description: publicHigher
        ? `Public search interest (${attn.publicAwareness}) far exceeds prediction market engagement (${overallActivity}) — public may be reacting to headlines without informed positioning`
        : `Prediction market activity (${overallActivity}) far exceeds public awareness (${attn.publicAwareness}) — informed bettors may see something the public hasn't noticed`,
      severity: attn.attentionMarketGap > 60 ? "high" : "medium",
      layers: ["attention", "predictionMarkets"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 6: Yield curve inverted but markets optimistic ---
  if (
    fs.yieldCurveInverted &&
    pm.momentum > 10 &&
    fs.confidence > 30
  ) {
    tensions.push({
      description:
        `Yield curve inverted (spread ${fs.yieldCurveSpread}%) — historically the strongest recession predictor — but prediction markets are optimistic (momentum +${pm.momentum})`,
      severity: "high",
      layers: ["fearSignals", "predictionMarkets"],
      category: "finance",
      implication: null,
    });
  }

  // --- Rule 7: Consumer sentiment declining but spending still strong ---
  if (
    ep.consumerSentimentTrend === "falling" &&
    ep.retailSalesTrend === "rising" &&
    ep.confidence > 40
  ) {
    tensions.push({
      description:
        `Consumer sentiment is declining but retail sales are still rising — people say they're worried but haven't changed spending behavior yet`,
      severity: "medium",
      layers: ["economicPsychology"],
      category: "finance",
      implication: null,
    });
  }

  // --- Rule 8: Rising unemployment signals but low public attention ---
  if (
    ep.joblessClaimsTrend === "rising" &&
    attn.publicAwareness < 30 &&
    ep.confidence > 30 &&
    attn.confidence > 20
  ) {
    tensions.push({
      description:
        `Jobless claims trending upward but public search interest is low (${attn.publicAwareness}/100) — labor market stress may not yet be on the public's radar`,
      severity: "medium",
      layers: ["economicPsychology", "attention"],
      category: "finance",
      implication: null,
    });
  }

  // --- Rule 9: VIX elevated + yield curve inverted = double fear signal ---
  // Not a tension per se, but a notable signal concordance worth surfacing
  if (
    fs.vix !== null &&
    fs.vixLevel === "elevated" &&
    fs.yieldCurveInverted &&
    fs.confidence > 40
  ) {
    tensions.push({
      description:
        `Double fear signal: VIX elevated at ${fs.vix} AND yield curve inverted at ${fs.yieldCurveSpread}% — both indicators pointing to stress simultaneously`,
      severity: "high",
      layers: ["fearSignals"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 10: Extreme VIX but consumer sentiment unchanged ---
  if (
    fs.vix !== null &&
    fs.vixLevel === "extreme" &&
    ep.consumerSentimentTrend === "stable" &&
    ep.confidence > 30
  ) {
    tensions.push({
      description:
        `VIX at extreme levels (${fs.vix}) indicating acute market fear, but consumer sentiment hasn't moved — the public may not yet feel what financial markets are pricing`,
      severity: "high",
      layers: ["fearSignals", "economicPsychology"],
      category: "cross-category",
      implication: null,
    });
  }

  // Sort by severity: high first, then medium, then low
  const severityOrder = { high: 0, medium: 1, low: 2 };
  tensions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return tensions;
}
