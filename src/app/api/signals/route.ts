import { NextResponse } from "next/server";
import { getAllLatestSignals, getSignalSourceAge } from "@/lib/db/client";
import { computeSignalLayers } from "@/lib/sentiment/signals";
import { FRED_SERIES } from "@/lib/platforms/fred";

export const revalidate = 60;

export async function GET() {
  try {
    const readings = getAllLatestSignals();
    const layers = computeSignalLayers();
    const fredAge = getSignalSourceAge("fred");

    return NextResponse.json({
      layers,
      readings: readings.map((r) => ({
        signalId: r.signalId,
        signalName: r.signalName,
        signalSource: r.signalSource,
        category: r.category,
        value: r.value,
        previousValue: r.previousValue,
        unit: r.unit,
        recordedAt: r.recordedAt,
      })),
      sources: {
        fred: {
          configured: FRED_SERIES.length,
          available: readings.filter((r) => r.signalSource === "fred").length,
          lastFetchAge: fredAge,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch signals:", error);
    return NextResponse.json(
      { error: "Failed to fetch signals" },
      { status: 500 },
    );
  }
}
