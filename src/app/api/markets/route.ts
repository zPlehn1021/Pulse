import { NextRequest, NextResponse } from "next/server";
import { getMarkets } from "@/lib/db/client";
import type { Platform, CategoryId, NormalizedMarket } from "@/lib/platforms/types";

export const revalidate = 60;

const VALID_PLATFORMS = new Set<string>([
  "polymarket",
  "kalshi",
  "manifold",
  "predictit",
  "feargreed",
]);

const VALID_CATEGORIES = new Set<string>([
  "politics",
  "finance",
  "crypto",
  "tech",
  "culture",
  "geopolitics",
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const platform = searchParams.get("platform");
  const category = searchParams.get("category");

  // Validate params
  if (platform && !VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: `Invalid platform: ${platform}` },
      { status: 400 },
    );
  }
  if (category && !VALID_CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: `Invalid category: ${category}` },
      { status: 400 },
    );
  }

  try {
    let markets = getMarkets(platform ?? undefined);

    // Filter by category if specified
    if (category) {
      markets = markets.filter((m) => m.category === category);
    }

    // If no filters, group by category
    if (!platform && !category) {
      const grouped: Record<string, NormalizedMarket[]> = {};
      for (const m of markets) {
        if (!grouped[m.category]) grouped[m.category] = [];
        grouped[m.category].push(m);
      }
      return NextResponse.json({
        grouped,
        totalMarkets: markets.length,
      });
    }

    return NextResponse.json({
      markets,
      count: markets.length,
      ...(platform && { platform: platform as Platform }),
      ...(category && { category: category as CategoryId }),
    });
  } catch (error) {
    console.error("Failed to fetch markets:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 },
    );
  }
}
