import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/db/client";
import { computeCompositeIndex } from "@/lib/sentiment/compute";
import type { NormalizedMarket } from "@/lib/platforms/types";

export const revalidate = 60;

export async function GET() {
  try {
    const markets = getMarkets() as NormalizedMarket[];
    const index = computeCompositeIndex(markets);

    const tensions = index.tensions ?? [];

    return NextResponse.json({
      tensions,
      meta: {
        count: tensions.length,
        highSeverity: tensions.filter((t) => t.severity === "high").length,
        mediumSeverity: tensions.filter((t) => t.severity === "medium").length,
        lowSeverity: tensions.filter((t) => t.severity === "low").length,
        hasSignalData: index.signalLayers !== null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to compute tensions:", error);
    return NextResponse.json(
      { error: "Failed to compute tensions" },
      { status: 500 },
    );
  }
}
