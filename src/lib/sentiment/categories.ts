import type { CategoryId, Platform } from "@/lib/platforms/types";

export interface PlatformDefinition {
  id: Platform;
  name: string;
  short: string;
  color: string;
  icon: string;
  note: string;
}

export const PLATFORMS: PlatformDefinition[] = [
  {
    id: "polymarket",
    name: "Polymarket",
    short: "PM",
    color: "#7C3AED",
    icon: "◆",
    note: "Real-money prediction market. Gamma API, tag-based categories.",
  },
  {
    id: "kalshi",
    name: "Kalshi",
    short: "KA",
    color: "#3B82F6",
    icon: "◇",
    note: "Real-money, CFTC-regulated. Events API, keyword-categorized.",
  },
  {
    id: "manifold",
    name: "Manifold",
    short: "MF",
    color: "#10B981",
    icon: "○",
    note: "Play-money market with massive variety. 0.1x volume dampening.",
  },
  {
    id: "predictit",
    name: "PredictIt",
    short: "PI",
    color: "#1B3A5C",
    icon: "▣",
    note: "Real-money US political prediction market. Public API.",
  },
  {
    id: "feargreed",
    name: "Fear & Greed",
    short: "FG",
    color: "#F7931A",
    icon: "◎",
    note: "Crypto sentiment index (0-100). Alternative.me.",
  },
];

const PLATFORM_MAP = new Map<Platform, PlatformDefinition>(
  PLATFORMS.map((p) => [p.id, p]),
);

export function getPlatformDef(id: Platform): PlatformDefinition {
  return PLATFORM_MAP.get(id)!;
}

export interface CategoryDefinition {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
  polymarketTagId: number;
  keywords: {
    kalshi: string[];
    manifold: string[];
  };
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    id: "politics",
    label: "Politics",
    icon: "🏛️",
    color: "#6366f1",
    polymarketTagId: 2,
    keywords: {
      kalshi: [
        "president", "election", "congress", "senate", "house",
        "democrat", "republican", "biden", "trump", "governor",
        "vote", "ballot", "impeach", "nominee", "primary",
        "cabinet", "legislation", "bill", "veto", "executive order",
      ],
      manifold: [
        "president", "election", "congress", "senate", "democrat",
        "republican", "biden", "trump", "governor", "vote",
        "ballot", "nominee", "primary", "political", "legislation",
        "party", "campaign", "electoral", "midterm",
      ],
    },
  },
  {
    id: "finance",
    label: "Finance",
    icon: "📈",
    color: "#10b981",
    polymarketTagId: 120,
    keywords: {
      kalshi: [
        "gdp", "inflation", "fed", "interest rate", "recession",
        "unemployment", "stock", "s&p", "nasdaq", "dow",
        "bond", "treasury", "cpi", "fomc", "rate cut",
        "rate hike", "jobs report", "nonfarm", "housing",
      ],
      manifold: [
        "gdp", "inflation", "fed", "interest rate", "recession",
        "unemployment", "stock market", "s&p 500", "nasdaq",
        "bond", "treasury", "economy", "economic", "financial",
        "market crash", "bull market", "bear market",
      ],
    },
  },
  {
    id: "crypto",
    label: "Crypto",
    icon: "₿",
    color: "#8b5cf6",
    polymarketTagId: 21,
    keywords: {
      kalshi: [
        "bitcoin", "btc", "ethereum", "eth", "crypto",
        "blockchain", "defi", "token", "solana", "sol",
        "nft", "sec crypto", "stablecoin", "binance", "coinbase",
        "halving", "mining",
      ],
      manifold: [
        "bitcoin", "btc", "ethereum", "eth", "crypto",
        "blockchain", "defi", "token", "solana", "nft",
        "web3", "dao", "stablecoin", "altcoin", "doge",
        "cryptocurrency",
      ],
    },
  },
  {
    id: "tech",
    label: "Technology",
    icon: "💻",
    color: "#3b82f6",
    polymarketTagId: 1401,
    keywords: {
      kalshi: [
        "ai", "artificial intelligence", "openai", "gpt", "google",
        "apple", "microsoft", "nvidia", "semiconductor", "chip",
        "robot", "agi", "llm", "tesla", "spacex",
        "meta", "amazon", "antitrust", "tech layoff",
      ],
      manifold: [
        "ai", "artificial intelligence", "openai", "gpt", "google",
        "apple", "microsoft", "nvidia", "semiconductor", "chip",
        "agi", "llm", "machine learning", "deep learning",
        "robot", "autonomous", "tech company",
      ],
    },
  },
  {
    id: "culture",
    label: "Culture",
    icon: "🎭",
    color: "#ec4899",
    polymarketTagId: 596,
    keywords: {
      kalshi: [
        "oscars", "super bowl", "nfl", "nba", "mlb",
        "world cup", "movie", "grammy", "emmy", "box office",
        "streaming", "spotify", "tiktok", "celebrity", "viral",
        "award", "championship", "playoffs",
      ],
      manifold: [
        "oscars", "super bowl", "nfl", "nba", "world cup",
        "movie", "grammy", "emmy", "box office", "streaming",
        "spotify", "tiktok", "celebrity", "sports", "entertainment",
        "award", "championship", "album",
      ],
    },
  },
  {
    id: "geopolitics",
    label: "Geopolitics",
    icon: "🌍",
    color: "#f59e0b",
    polymarketTagId: 100265,
    keywords: {
      kalshi: [
        "war", "nato", "ukraine", "russia", "china",
        "taiwan", "iran", "israel", "sanction", "tariff",
        "trade war", "military", "nuclear", "missile", "ceasefire",
        "un security", "invasion", "conflict", "diplomat",
      ],
      manifold: [
        "war", "nato", "ukraine", "russia", "china",
        "taiwan", "iran", "israel", "sanction", "tariff",
        "trade war", "military", "nuclear", "ceasefire",
        "invasion", "conflict", "geopolit", "diplomat", "treaty",
      ],
    },
  },
];

const CATEGORY_MAP = new Map<CategoryId, CategoryDefinition>(
  CATEGORIES.map((c) => [c.id, c]),
);

export function getCategoryDef(id: CategoryId): CategoryDefinition {
  return CATEGORY_MAP.get(id)!;
}

/**
 * Look up the Polymarket tag ID for a category.
 */
export function getPolymarketTagId(category: CategoryId): number {
  return getCategoryDef(category).polymarketTagId;
}

/**
 * Get the keyword set for a platform + category pair.
 */
export function getKeywords(
  category: CategoryId,
  platform: Exclude<Platform, "polymarket" | "predictit" | "feargreed">,
): string[] {
  return getCategoryDef(category).keywords[platform];
}

/**
 * Attempt to categorize a market question by matching keywords.
 * Scores each category by counting keyword hits in the text.
 * Returns the best match, or null if no keywords matched at all.
 */
export function categorizeByKeywords(text: string): CategoryId | null {
  const lower = text.toLowerCase();
  let bestCategory: CategoryId | null = null;
  let bestScore = 0;

  for (const cat of CATEGORIES) {
    // Merge both keyword sets for broadest matching
    const allKeywords = [...cat.keywords.kalshi, ...cat.keywords.manifold];
    const unique = [...new Set(allKeywords)];

    let score = 0;
    for (const kw of unique) {
      if (lower.includes(kw)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat.id;
    }
  }

  return bestCategory;
}
