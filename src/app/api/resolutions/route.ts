import { NextResponse } from "next/server";
import { getResolutions, getResolutionsByCategory } from "@/lib/db/client";

export const revalidate = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    const resolutions = category
      ? getResolutionsByCategory(category, limit)
      : getResolutions(limit);

    return NextResponse.json({
      resolutions: resolutions.map((r) => ({
        id: r.id,
        marketId: r.marketId,
        eventType: r.eventType,
        description: r.eventDescription,
        category: r.category,
        outcome: r.outcome,
        resolvedAt: r.resolvedAt,
        predictionCorrect: r.predictionMarketCorrect === 1,
        confidenceAtClose: r.pmConfidenceAtClose,
        consumerSentimentDirection: r.consumerSentimentDirection,
        fearSignalsDirection: r.fearSignalsDirection,
        attentionLevel: r.attentionLevel,
        retrospective: r.aiRetrospective,
      })),
      meta: {
        count: resolutions.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to fetch resolutions:", error);
    return NextResponse.json(
      { error: "Failed to fetch resolutions" },
      { status: 500 },
    );
  }
}
