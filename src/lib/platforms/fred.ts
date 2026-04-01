/**
 * FRED (Federal Reserve Economic Data) Adapter
 *
 * Fetches economic indicators from the St. Louis Fed's FRED API.
 * These form two signal layers:
 *   - Economic Psychology (consumer sentiment, employment, spending)
 *   - Fear Signals (VIX, yield curve, credit spreads, gold, dollar)
 */

import { withRetry, fetchOrThrow } from "./retry";
import {
  saveSignalReadings,
  getLatestSignalReading,
  type SignalReading,
} from "@/lib/db/client";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

// ---------------------------------------------------------------------------
// Series configuration
// ---------------------------------------------------------------------------

export type SignalLayer = "economic_psychology" | "fear_signals";

interface FredSeriesConfig {
  id: string;
  name: string;
  layer: SignalLayer;
  unit: string;
  category: string | null;
}

/**
 * All FRED series we track, organized by signal layer.
 */
export const FRED_SERIES: FredSeriesConfig[] = [
  // ── Economic Psychology ──────────────────────────────────────────────
  {
    id: "UMCSENT",
    name: "U. of Michigan Consumer Sentiment",
    layer: "economic_psychology",
    unit: "index",
    category: "finance",
  },
  {
    id: "CSCICP03USM665S",
    name: "Consumer Confidence (Composite, Amplitude Adjusted)",
    layer: "economic_psychology",
    unit: "index",
    category: "finance",
  },
  {
    id: "MICH",
    name: "U. of Michigan: Inflation Expectation",
    layer: "economic_psychology",
    unit: "percent",
    category: "finance",
  },
  {
    id: "UNRATE",
    name: "Unemployment Rate",
    layer: "economic_psychology",
    unit: "percent",
    category: "finance",
  },
  {
    id: "ICSA",
    name: "Initial Jobless Claims",
    layer: "economic_psychology",
    unit: "thousands",
    category: "finance",
  },
  {
    id: "RSAFS",
    name: "Retail Sales",
    layer: "economic_psychology",
    unit: "millions_usd",
    category: "finance",
  },
  {
    id: "PSAVERT",
    name: "Personal Savings Rate",
    layer: "economic_psychology",
    unit: "percent",
    category: "finance",
  },
  {
    id: "NFCI",
    name: "Chicago Fed Financial Conditions",
    layer: "economic_psychology",
    unit: "index",
    category: "finance",
  },

  // ── Fear Signals ─────────────────────────────────────────────────────
  {
    id: "VIXCLS",
    name: "CBOE Volatility Index (VIX)",
    layer: "fear_signals",
    unit: "index",
    category: null,
  },
  {
    id: "T10Y2Y",
    name: "10-Year minus 2-Year Treasury Spread",
    layer: "fear_signals",
    unit: "percent",
    category: null,
  },
  {
    id: "BAMLH0A0HYM2",
    name: "High Yield Bond Spread",
    layer: "fear_signals",
    unit: "percent",
    category: null,
  },
  {
    id: "DTWEXBGS",
    name: "Trade-Weighted Dollar Index",
    layer: "fear_signals",
    unit: "index",
    category: null,
  },
  {
    id: "PPIACO",
    name: "Producer Price Index (All Commodities)",
    layer: "fear_signals",
    unit: "index",
    category: null,
  },
];

// ---------------------------------------------------------------------------
// FRED API fetcher
// ---------------------------------------------------------------------------

interface FredObservation {
  date: string;
  value: string;
}

interface FredApiResponse {
  observations: FredObservation[];
}

/**
 * Fetch the latest observations for a FRED series.
 * Returns the most recent 2 observations (for current + previous value).
 */
async function fetchSeries(seriesId: string): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url =
    `${FRED_BASE}?series_id=${seriesId}` +
    `&api_key=${apiKey}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=2`;

  const res = await withRetry(
    () => fetchOrThrow(url),
    { platform: "fred", endpoint: seriesId },
  );
  const data = (await res.json()) as FredApiResponse;
  return data.observations ?? [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all configured FRED series and save new readings to the database.
 * Skips series whose latest reading in the DB matches the current FRED value
 * (no new data available).
 *
 * Returns the number of new readings saved.
 */
export async function fetchAllFredData(): Promise<{
  saved: number;
  skipped: number;
  errors: string[];
}> {
  const newReadings: SignalReading[] = [];
  let skipped = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  // Fetch all series in parallel (FRED allows 120 req/min, we have ~13 series)
  const results = await Promise.allSettled(
    FRED_SERIES.map(async (series) => {
      const observations = await fetchSeries(series.id);
      return { series, observations };
    }),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(String(result.reason));
      continue;
    }

    const { series, observations } = result.value;
    if (observations.length === 0) {
      skipped++;
      continue;
    }

    const latest = observations[0];
    const value = parseFloat(latest.value);

    // FRED returns "." for missing/unavailable data
    if (isNaN(value)) {
      skipped++;
      continue;
    }

    // Check if we already have this exact reading
    const existing = getLatestSignalReading(series.id);
    if (
      existing &&
      existing.value === value &&
      existing.metadata &&
      (existing.metadata as Record<string, unknown>).observation_date === latest.date
    ) {
      skipped++;
      continue;
    }

    // Get previous value for delta computation
    const previousObs = observations[1];
    const previousValue = previousObs
      ? parseFloat(previousObs.value)
      : existing?.value ?? null;

    newReadings.push({
      signalSource: "fred",
      signalId: series.id,
      signalName: series.name,
      category: series.category,
      value,
      previousValue: previousValue !== null && !isNaN(previousValue) ? previousValue : null,
      unit: series.unit,
      recordedAt: now,
      metadata: {
        observation_date: latest.date,
        layer: series.layer,
      },
    });
  }

  if (newReadings.length > 0) {
    saveSignalReadings(newReadings);
  }

  return { saved: newReadings.length, skipped, errors };
}

/**
 * Get all latest FRED readings, organized by signal layer.
 */
export function getLatestFredReadings(): {
  economicPsychology: SignalReading[];
  fearSignals: SignalReading[];
} {
  const economicPsychology: SignalReading[] = [];
  const fearSignals: SignalReading[] = [];

  for (const series of FRED_SERIES) {
    const reading = getLatestSignalReading(series.id);
    if (!reading) continue;

    if (series.layer === "economic_psychology") {
      economicPsychology.push(reading);
    } else {
      fearSignals.push(reading);
    }
  }

  return { economicPsychology, fearSignals };
}
