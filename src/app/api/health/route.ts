import { NextResponse } from "next/server";
import {
  getPlatformHealthDetails,
} from "@/lib/platforms/health";
import {
  getSignalSourceAge,
  getAttentionTermsAge,
  getLatestNarrativeAge,
} from "@/lib/db/client";

export const dynamic = "force-dynamic";

interface LayerHealth {
  status: "healthy" | "stale" | "unavailable";
  lastUpdate: string | null;
  ageMinutes: number | null;
}

function ageToStatus(ageMs: number | null, thresholdMs: number): LayerHealth {
  if (ageMs === null) {
    return { status: "unavailable", lastUpdate: null, ageMinutes: null };
  }
  const ageMinutes = Math.round(ageMs / 60000);
  const lastUpdate = new Date(Date.now() - ageMs).toISOString();
  return {
    status: ageMs > thresholdMs ? "stale" : "healthy",
    lastUpdate,
    ageMinutes,
  };
}

export async function GET() {
  const HOUR = 60 * 60 * 1000;
  const TWO_HOURS = 2 * HOUR;

  // Prediction market platforms
  const platformHealth = getPlatformHealthDetails();
  const platforms: Record<string, unknown> = {};
  for (const [name, state] of Object.entries(platformHealth)) {
    platforms[name] = {
      status: state.status,
      consecutiveFailures: state.consecutiveFailures,
      lastSuccess: state.lastSuccess ? new Date(state.lastSuccess).toISOString() : null,
      lastFailure: state.lastFailure ? new Date(state.lastFailure).toISOString() : null,
    };
  }

  // FRED (economic data)
  const fredAge = getSignalSourceAge("fred");
  const fred = ageToStatus(fredAge, TWO_HOURS);

  // Google Trends (attention data)
  const trendsAge = getAttentionTermsAge();
  const trends = ageToStatus(trendsAge, TWO_HOURS);

  // AI narratives
  const narrativeAge = getLatestNarrativeAge();
  const narratives = ageToStatus(narrativeAge, TWO_HOURS);

  // Overall status
  const platformStatuses = Object.values(platformHealth).map((s) => s.status);
  const allPlatformsDown = platformStatuses.every((s) => s !== "healthy");
  const anyPlatformDegraded = platformStatuses.some((s) => s !== "healthy");

  let overall: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (allPlatformsDown) {
    overall = "unhealthy";
  } else if (
    anyPlatformDegraded ||
    fred.status !== "healthy" ||
    trends.status !== "healthy"
  ) {
    overall = "degraded";
  }

  return NextResponse.json({
    status: overall,
    timestamp: new Date().toISOString(),
    layers: {
      predictionMarkets: {
        platforms,
        summary: `${platformStatuses.filter((s) => s === "healthy").length}/${platformStatuses.length} healthy`,
      },
      economicPsychology: {
        source: "FRED",
        configured: !!process.env.FRED_API_KEY,
        ...fred,
      },
      fearSignals: {
        source: "FRED",
        configured: !!process.env.FRED_API_KEY,
        ...fred, // Same source as economic psychology
      },
      attention: {
        source: "Google Trends (AI-curated)",
        configured: !!process.env.ANTHROPIC_API_KEY,
        ...trends,
      },
      aiNarratives: {
        configured: !!process.env.ANTHROPIC_API_KEY,
        ...narratives,
      },
    },
    env: {
      FRED_API_KEY: process.env.FRED_API_KEY ? "set" : "missing",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "set" : "missing",
      CRON_SECRET: process.env.CRON_SECRET ? "set" : "missing",
    },
  });
}
