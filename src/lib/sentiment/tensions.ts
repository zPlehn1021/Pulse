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
  if (
    pm.momentum < -10 &&
    ep.consumerSentiment !== null &&
    ep.consumerSentiment > 60 &&
    ep.confidence > 20
  ) {
    tensions.push({
      description:
        `Prediction markets shifting pessimistic (momentum ${pm.momentum}) but consumer sentiment remains at ${ep.consumerSentiment} — informed bettors are souring on the future while ordinary people still feel OK`,
      severity: ep.consumerSentiment > 75 ? "high" : "medium",
      layers: ["predictionMarkets", "economicPsychology"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 2: Markets bullish but consumers pessimistic ---
  if (
    pm.momentum > 10 &&
    ep.consumerSentiment !== null &&
    ep.consumerSentiment < 60 &&
    ep.confidence > 20
  ) {
    const gap = pm.momentum - ep.consumerSentiment;
    tensions.push({
      description:
        `Prediction markets are optimistic (momentum +${pm.momentum}) but consumer sentiment is depressed at ${ep.consumerSentiment} — bettors see a better future than ordinary consumers feel right now`,
      severity: ep.consumerSentiment < 50 ? "high" : "medium",
      layers: ["predictionMarkets", "economicPsychology"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 3: Fear signals elevated but prediction markets calm ---
  if (
    fs.composite > 40 &&
    Math.abs(pm.momentum) < 15 &&
    fs.confidence > 20
  ) {
    tensions.push({
      description:
        `Fear indicators are elevated (composite ${fs.composite}/100, VIX at ${fs.vix ?? "N/A"}) but prediction market sentiment is relatively calm — financial anxiety hasn't translated into changed beliefs about outcomes`,
      severity: fs.composite > 65 ? "high" : "medium",
      layers: ["fearSignals", "predictionMarkets"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 4: Fear signals calm but markets volatile ---
  if (
    fs.composite < 35 &&
    Math.abs(pm.momentum) > 20 &&
    fs.confidence > 20
  ) {
    tensions.push({
      description:
        `Fear indicators are calm (composite ${fs.composite}/100) but prediction markets are shifting sharply (momentum ${pm.momentum}) — bettors are repositioning without traditional fear signals triggering`,
      severity: Math.abs(pm.momentum) > 35 ? "high" : "medium",
      layers: ["fearSignals", "predictionMarkets"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 5: Attention-market gap ---
  if (attn.attentionMarketGap >= 30 && attn.confidence > 10) {
    const publicHigher = attn.publicAwareness > overallActivity;
    tensions.push({
      description: publicHigher
        ? `Public search interest (${attn.publicAwareness}/100) far exceeds prediction market activity (${overallActivity}/100) — the public is reacting to headlines without informed bettors matching that concern`
        : `Prediction market activity (${overallActivity}/100) far exceeds public search interest (${attn.publicAwareness}/100) — informed bettors may be pricing in scenarios the public hasn't noticed yet`,
      severity: attn.attentionMarketGap > 50 ? "high" : "medium",
      layers: ["attention", "predictionMarkets"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 6: Yield curve inverted but markets optimistic ---
  if (
    fs.yieldCurveInverted &&
    pm.momentum > 5 &&
    fs.confidence > 20
  ) {
    tensions.push({
      description:
        `Yield curve inverted (spread ${fs.yieldCurveSpread}%) — historically the strongest recession predictor — but prediction markets are optimistic (momentum +${pm.momentum}). One of these signals will prove wrong.`,
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
    ep.confidence > 20
  ) {
    tensions.push({
      description:
        `Consumer sentiment is declining but retail sales are still rising — people say they're worried but haven't changed spending behavior. Historically this gap closes: either mood improves or wallets snap shut.`,
      severity: "medium",
      layers: ["economicPsychology"],
      category: "finance",
      implication: null,
    });
  }

  // --- Rule 8: Rising jobless claims but low public attention ---
  if (
    ep.joblessClaimsTrend === "rising" &&
    attn.publicAwareness < 45 &&
    ep.confidence > 20
  ) {
    tensions.push({
      description:
        `Jobless claims are trending upward but public search interest is only ${attn.publicAwareness}/100 — labor market stress may be building below the radar of public awareness`,
      severity: attn.publicAwareness < 25 ? "high" : "medium",
      layers: ["economicPsychology", "attention"],
      category: "finance",
      implication: null,
    });
  }

  // --- Rule 9: VIX elevated + yield curve inverted = double fear signal ---
  if (
    fs.vix !== null &&
    (fs.vixLevel === "elevated" || fs.vixLevel === "extreme") &&
    fs.yieldCurveInverted &&
    fs.confidence > 20
  ) {
    tensions.push({
      description:
        `Double fear signal: VIX elevated at ${fs.vix} AND yield curve inverted at ${fs.yieldCurveSpread}% — both short-term anxiety and long-term recession indicators pointing to stress simultaneously`,
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
    ep.confidence > 20
  ) {
    tensions.push({
      description:
        `VIX at extreme levels (${fs.vix}) indicating acute market fear, but consumer sentiment hasn't moved — the public hasn't yet absorbed what financial markets are pricing`,
      severity: "high",
      layers: ["fearSignals", "economicPsychology"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 11: Elevated VIX but consumer sentiment stable (milder version of 10) ---
  if (
    fs.vix !== null &&
    fs.vixLevel === "elevated" &&
    ep.consumerSentimentTrend === "stable" &&
    ep.consumerSentiment !== null &&
    ep.consumerSentiment < 65 &&
    ep.confidence > 20
  ) {
    tensions.push({
      description:
        `VIX elevated at ${fs.vix} signaling Wall Street anxiety, but consumer sentiment sits flat at ${ep.consumerSentiment} — financial markets sense risk that hasn't filtered down to how people feel about their own economic situation`,
      severity: "medium",
      layers: ["fearSignals", "economicPsychology"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 12: Low savings rate + rising fear ---
  if (
    ep.savingsRate !== null &&
    ep.savingsRate < 5 &&
    fs.composite > 35 &&
    ep.confidence > 20
  ) {
    tensions.push({
      description:
        `Personal savings rate is low at ${ep.savingsRate}% while fear signals are elevated (composite ${fs.composite}/100) — consumers have limited financial cushion during a period of rising anxiety`,
      severity: ep.savingsRate < 3.5 ? "high" : "medium",
      layers: ["economicPsychology", "fearSignals"],
      category: "finance",
      implication: null,
    });
  }

  // --- Rule 13: Gold rising + markets optimistic = hedging disconnect ---
  if (
    fs.goldTrend === "rising" &&
    pm.momentum > 15 &&
    fs.confidence > 20
  ) {
    tensions.push({
      description:
        `Commodity markets show flight-to-safety behavior (gold rising) but prediction markets are optimistic (momentum +${pm.momentum}) — smart money is hedging even as collective belief leans positive`,
      severity: "medium",
      layers: ["fearSignals", "predictionMarkets"],
      category: "finance",
      implication: null,
    });
  }

  // --- Rule 14: Unemployment rising + markets optimistic ---
  if (
    ep.unemploymentRate !== null &&
    ep.unemploymentRate > 4 &&
    ep.joblessClaimsTrend === "rising" &&
    pm.momentum > 15 &&
    ep.confidence > 20
  ) {
    tensions.push({
      description:
        `Unemployment at ${ep.unemploymentRate}% with jobless claims rising, yet prediction market sentiment is optimistic (momentum +${pm.momentum}) — labor market deterioration hasn't shaken collective confidence about the future`,
      severity: ep.unemploymentRate > 5 ? "high" : "medium",
      layers: ["economicPsychology", "predictionMarkets"],
      category: "cross-category",
      implication: null,
    });
  }

  // --- Rule 15: Yield curve nearly flat + stable sentiment = complacency risk ---
  if (
    fs.yieldCurveSpread !== null &&
    fs.yieldCurveSpread < 0.6 &&
    fs.yieldCurveSpread > -0.1 &&
    ep.consumerSentimentTrend === "stable" &&
    fs.confidence > 20
  ) {
    tensions.push({
      description:
        `Yield curve nearly flat at ${fs.yieldCurveSpread}% (approaching inversion territory) while consumer sentiment is stable — historically, this quiet period before inversion is when complacency is highest`,
      severity: fs.yieldCurveSpread < 0.3 ? "high" : "medium",
      layers: ["fearSignals", "economicPsychology"],
      category: "finance",
      implication: null,
    });
  }

  // Sort by severity: high first, then medium, then low
  const severityOrder = { high: 0, medium: 1, low: 2 };
  tensions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return tensions;
}
