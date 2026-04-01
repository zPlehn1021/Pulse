/**
 * Signal Layer Composites
 *
 * Computes composite scores for the economic psychology and fear signal layers
 * from raw FRED readings. These scores are included in the CompositeIndex.
 */

import { getLatestFredReadings } from "@/lib/platforms/fred";
import type { SignalReading } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EconomicPsychologySignal {
  consumerSentiment: number | null;
  consumerSentimentTrend: "rising" | "falling" | "stable";
  expectationsVsPresent: number | null;
  unemploymentRate: number | null;
  joblessClaimsTrend: "rising" | "falling" | "stable";
  savingsRate: number | null;
  retailSalesTrend: "rising" | "falling" | "stable";
  financialConditions: number | null;
  confidence: number;
}

export interface FearSignalsData {
  composite: number;
  vix: number | null;
  vixLevel: "low" | "moderate" | "elevated" | "extreme";
  yieldCurveSpread: number | null;
  yieldCurveInverted: boolean;
  highYieldSpread: number | null;
  goldTrend: "rising" | "falling" | "stable";
  dollarTrend: "rising" | "falling" | "stable";
  confidence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findReading(
  readings: SignalReading[],
  signalId: string,
): SignalReading | undefined {
  return readings.find((r) => r.signalId === signalId);
}

function computeTrend(
  current: number | undefined,
  previous: number | undefined | null,
): "rising" | "falling" | "stable" {
  if (current === undefined || previous === undefined || previous === null)
    return "stable";
  const delta = current - previous;
  const threshold = Math.abs(previous) * 0.005; // 0.5% change threshold
  if (delta > threshold) return "rising";
  if (delta < -threshold) return "falling";
  return "stable";
}

// ---------------------------------------------------------------------------
// Economic Psychology Composite
// ---------------------------------------------------------------------------

export function computeEconomicPsychology(
  readings: SignalReading[],
): EconomicPsychologySignal {
  const umcsent = findReading(readings, "UMCSENT");
  const consConf = findReading(readings, "CSCICP03USM665S");
  const inflExp = findReading(readings, "MICH");
  const unrate = findReading(readings, "UNRATE");
  const icsa = findReading(readings, "ICSA");
  const rsafs = findReading(readings, "RSAFS");
  const psavert = findReading(readings, "PSAVERT");
  const nfci = findReading(readings, "NFCI");

  // Count how many signals we have data for
  const available = [umcsent, consConf, inflExp, unrate, icsa, rsafs, psavert, nfci].filter(Boolean).length;
  const confidence = Math.round((available / 8) * 100);

  // Expectations vs present: gap between consumer sentiment and confidence composite
  // Positive = expectations higher than current sentiment, negative = pessimism about future
  const expectationsVsPresent =
    umcsent && consConf
      ? Math.round((umcsent.value - consConf.value) * 10) / 10
      : null;

  return {
    consumerSentiment: umcsent?.value ?? null,
    consumerSentimentTrend: computeTrend(umcsent?.value, umcsent?.previousValue),
    expectationsVsPresent,
    unemploymentRate: unrate?.value ?? null,
    joblessClaimsTrend: computeTrend(icsa?.value, icsa?.previousValue),
    savingsRate: psavert?.value ?? null,
    retailSalesTrend: computeTrend(rsafs?.value, rsafs?.previousValue),
    financialConditions: nfci?.value ?? null,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Fear Signals Composite
// ---------------------------------------------------------------------------

/**
 * Compute the fear composite score (0-100).
 *
 * Components and their contribution:
 *   VIX (40%): Normalized to 0-100 scale (VIX 12=0, VIX 40+=100)
 *   Yield curve (25%): Inverted = high fear, steep = low fear
 *   High yield spread (20%): Higher spread = more fear
 *   Gold trend (10%): Rising = more fear
 *   Dollar trend (5%): Rising = more fear (flight to safety)
 */
export function computeFearSignals(
  readings: SignalReading[],
): FearSignalsData {
  const vixReading = findReading(readings, "VIXCLS");
  const yieldReading = findReading(readings, "T10Y2Y");
  const hyReading = findReading(readings, "BAMLH0A0HYM2");
  const commodityReading = findReading(readings, "PPIACO");
  const dollarReading = findReading(readings, "DTWEXBGS");

  const available = [vixReading, yieldReading, hyReading, commodityReading, dollarReading].filter(Boolean).length;
  const confidence = Math.round((available / 5) * 100);

  // VIX score: 0-100 (VIX 12 = 0 fear, VIX 40+ = 100 fear)
  const vix = vixReading?.value ?? null;
  const vixScore = vix !== null ? Math.min(100, Math.max(0, ((vix - 12) / 28) * 100)) : null;
  const vixLevel: FearSignalsData["vixLevel"] =
    vix === null ? "moderate" :
    vix < 15 ? "low" :
    vix < 25 ? "moderate" :
    vix < 35 ? "elevated" :
    "extreme";

  // Yield curve: negative spread = inverted = high fear
  // Range: -1.0 (fully inverted, fear=100) to +2.0 (steep, fear=0)
  const yieldSpread = yieldReading?.value ?? null;
  const yieldScore = yieldSpread !== null
    ? Math.min(100, Math.max(0, ((2.0 - yieldSpread) / 3.0) * 100))
    : null;

  // High yield spread: higher = more fear
  // Range: 3% (calm, fear=0) to 10%+ (crisis, fear=100)
  const hySpread = hyReading?.value ?? null;
  const hyScore = hySpread !== null
    ? Math.min(100, Math.max(0, ((hySpread - 3.0) / 7.0) * 100))
    : null;

  // Commodity trend (PPI): rising = inflationary pressure = fear
  const goldTrend = computeTrend(commodityReading?.value, commodityReading?.previousValue);
  const goldScore = goldTrend === "rising" ? 70 : goldTrend === "falling" ? 30 : 50;

  // Dollar trend: rising = flight to safety = fear
  const dollarTrend = computeTrend(dollarReading?.value, dollarReading?.previousValue);
  const dollarScore = dollarTrend === "rising" ? 70 : dollarTrend === "falling" ? 30 : 50;

  // Weighted composite
  let compositeNum = 0;
  let compositeDen = 0;

  if (vixScore !== null) { compositeNum += vixScore * 0.40; compositeDen += 0.40; }
  if (yieldScore !== null) { compositeNum += yieldScore * 0.25; compositeDen += 0.25; }
  if (hyScore !== null) { compositeNum += hyScore * 0.20; compositeDen += 0.20; }
  compositeNum += goldScore * 0.10; compositeDen += 0.10;
  compositeNum += dollarScore * 0.05; compositeDen += 0.05;

  const composite = compositeDen > 0 ? Math.round(compositeNum / compositeDen) : 50;

  return {
    composite,
    vix,
    vixLevel,
    yieldCurveSpread: yieldSpread,
    yieldCurveInverted: yieldSpread !== null && yieldSpread < 0,
    highYieldSpread: hySpread,
    goldTrend,
    dollarTrend,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Combined signal layers
// ---------------------------------------------------------------------------

export interface SignalLayers {
  economicPsychology: EconomicPsychologySignal;
  fearSignals: FearSignalsData;
}

/**
 * Compute all signal layer composites from the latest FRED data.
 */
export function computeSignalLayers(): SignalLayers {
  const { economicPsychology: epReadings, fearSignals: fsReadings } =
    getLatestFredReadings();

  return {
    economicPsychology: computeEconomicPsychology(epReadings),
    fearSignals: computeFearSignals(fsReadings),
  };
}
