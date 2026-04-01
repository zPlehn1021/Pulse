import { NextResponse } from "next/server";
import { computeTrackRecord } from "@/lib/db/client";

export const revalidate = 60;

export async function GET() {
  try {
    const trackRecord = computeTrackRecord();

    if (!trackRecord) {
      return NextResponse.json({
        status: "building",
        message: "PULSE is building its track record. Resolution data will appear here as prediction markets resolve over time.",
        totalResolutions: 0,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      status: "active",
      totalResolutions: trackRecord.totalResolutions,
      predictionMarketAccuracy: trackRecord.predictionMarketAccuracy,
      signalConcordanceRate: trackRecord.signalConcordanceRate,
      byCategory: trackRecord.byCategory,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to compute track record:", error);
    return NextResponse.json(
      { error: "Failed to compute track record" },
      { status: 500 },
    );
  }
}
