import { NextRequest, NextResponse } from "next/server";
import { getHistory, getCategoryHistory } from "@/lib/db/client";
import type { CategoryId } from "@/lib/platforms/types";

export const revalidate = 60;

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
  const hoursParam = searchParams.get("hours");
  const category = searchParams.get("category");

  const hours = hoursParam ? parseInt(hoursParam, 10) : 24;
  if (isNaN(hours) || hours < 1 || hours > 168) {
    return NextResponse.json(
      { error: "hours must be between 1 and 168" },
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
    // If a specific category is requested, return lightweight score history
    if (category) {
      const history = getCategoryHistory(category as CategoryId, hours);
      return NextResponse.json({
        category,
        hours,
        history,
        points: history.length,
      });
    }

    // Otherwise return full composite history
    const history = getHistory(hours);
    return NextResponse.json({
      hours,
      history,
      points: history.length,
    });
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 },
    );
  }
}
