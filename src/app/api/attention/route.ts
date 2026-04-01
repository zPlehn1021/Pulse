import { NextResponse } from "next/server";
import {
  getLatestAttentionTerms,
  getAttentionTermsAge,
} from "@/lib/db/client";
import { computeAttentionScores } from "@/lib/platforms/trends";

export const revalidate = 60;

export async function GET() {
  try {
    const terms = getLatestAttentionTerms();
    const scores = computeAttentionScores(terms);
    const age = getAttentionTermsAge();

    return NextResponse.json({
      scores,
      terms: terms.map((t) => ({
        term: t.term,
        category: t.category,
        reason: t.generatedReason,
        trendValue: t.trendValue,
        trendFetchedAt: t.trendFetchedAt,
      })),
      meta: {
        totalTerms: terms.length,
        fetchedTerms: terms.filter((t) => t.trendValue !== null).length,
        lastCurationAge: age,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to fetch attention data:", error);
    return NextResponse.json(
      { error: "Failed to fetch attention data" },
      { status: 500 },
    );
  }
}
