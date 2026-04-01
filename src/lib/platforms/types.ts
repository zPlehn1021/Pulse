export type Platform = 'polymarket' | 'kalshi' | 'manifold' | 'predictit' | 'feargreed';
export type CategoryId = 'politics' | 'finance' | 'crypto' | 'tech'
  | 'culture' | 'geopolitics';

/**
 * Platform credibility tiers — real money with real stakes is the
 * most reliable signal, play money the least.
 */
export type PlatformTier = 'real_money_high' | 'real_money_low' | 'play_money' | 'index';

export const PLATFORM_TIERS: Record<Platform, { tier: PlatformTier; weight: number }> = {
  polymarket:  { tier: 'real_money_high', weight: 1.0 },
  kalshi:      { tier: 'real_money_high', weight: 1.0 },
  predictit:   { tier: 'real_money_low',  weight: 0.6 },
  manifold:    { tier: 'play_money',      weight: 0.3 },
  feargreed:   { tier: 'index',           weight: 0.0 }, // shown separately, never blended
};

// ---------------------------------------------------------------------------
// Raw market data (unchanged from adapters)
// ---------------------------------------------------------------------------

export interface NormalizedMarket {
  id: string;
  platform: Platform;
  question: string;
  category: CategoryId;
  yesPrice: number;        // 0-1
  volume24h: number;       // USD
  liquidity: number;
  lastUpdated: Date;
  sourceUrl: string;
  resolution?: 'yes' | 'no' | null;
}

// ---------------------------------------------------------------------------
// Enriched market with price history context (computed at analysis time)
// ---------------------------------------------------------------------------

export interface MarketWithMomentum extends NormalizedMarket {
  /** Price 1 hour ago (null if no history) */
  priceHoursAgo1: number | null;
  /** Price 6 hours ago */
  priceHoursAgo6: number | null;
  /** Price 24 hours ago */
  priceHoursAgo24: number | null;
  /** Absolute price change over 24h (positive = moved toward YES) */
  delta24h: number;
  /** Annualized volatility from recent price samples (0-1 scale) */
  volatility: number;
}

// ---------------------------------------------------------------------------
// Category-level analysis (replaces old CategorySentiment)
// ---------------------------------------------------------------------------

export interface CategoryAnalysis {
  category: CategoryId;

  /** Total questions tracked in this category */
  marketCount: number;

  /**
   * Sentiment direction: -100 to +100.
   * Positive = collective belief shifting toward YES (growing optimism).
   * Negative = collective belief shifting toward NO (growing pessimism).
   * Weighted by engagement level * platform credibility tier.
   */
  momentum: number;

  /**
   * Engagement level: 0-100.
   * Combines question count and total participation.
   * High = many people actively weighing in on this category.
   */
  activity: number;

  /**
   * Consensus: 0-100.
   * How much do platforms agree with each other on overlapping questions?
   * High = strong agreement, Low = significant disagreement.
   * Only meaningful when cross-platform matches exist.
   */
  consensus: number;

  /**
   * Uncertainty: 0-100.
   * How much beliefs are shifting and changing.
   * High = people are changing their minds, beliefs in flux.
   * Low = beliefs are settled and stable.
   */
  volatility: number;

  /** Top 5 most-watched questions, enriched with sentiment data */
  topMarkets: MarketWithMomentum[];

  /** Per-platform breakdown */
  platformBreakdown: Record<Platform, {
    marketCount: number;
    avgPrice: number;
    momentum: number;
    weight: number;
  }>;

  /** AI-generated narrative summary (null if not yet generated) */
  narrative: string | null;
}

// ---------------------------------------------------------------------------
// Cross-community disagreements (same question, different beliefs)
// ---------------------------------------------------------------------------

export interface MarketMatch {
  /** Normalized question text used for matching */
  matchKey: string;
  /** Markets from different platforms covering the same event */
  markets: {
    platform: Platform;
    marketId: string;
    question: string;
    yesPrice: number;
    volume24h: number;
  }[];
  /** Max price spread between platforms (percentage points) */
  spread: number;
  /** Highest-priced platform */
  highPlatform: Platform;
  /** Lowest-priced platform */
  lowPlatform: Platform;
}

export interface Divergence {
  category: CategoryId;
  /** The matched question text */
  question: string;
  spread: number;
  highPlatform: Platform;
  highPrice: number;
  lowPlatform: Platform;
  lowPrice: number;
}

// ---------------------------------------------------------------------------
// Composite index (top-level dashboard state)
// ---------------------------------------------------------------------------

export interface CompositeIndex {
  /**
   * Overall sentiment direction: -100 to +100.
   * Weighted average of category sentiment shifts.
   */
  momentum: number;

  /**
   * Overall uncertainty: 0-100.
   * How much are collective beliefs shifting right now?
   */
  volatility: number;

  /**
   * Overall engagement: 0-100.
   * How actively are people weighing in across all platforms?
   */
  activity: number;

  totalMarkets: number;
  categories: CategoryAnalysis[];
  divergences: Divergence[];
  timestamp: Date;

  /** Top-level AI briefing across all categories */
  narrative: string | null;

  /** v2: Signal layers from external data sources (FRED, etc.) */
  signalLayers?: SignalLayersData | null;

  /** v2: Cross-layer signal tensions (disagreements between signal layers) */
  tensions?: SignalTension[];
}

/**
 * v2: Multi-source signal layer data included in CompositeIndex.
 */
export interface SignalLayersData {
  predictionMarkets: {
    momentum: number;
    confidence: number;
    marketCount: number;
  };
  economicPsychology: {
    consumerSentiment: number | null;
    consumerSentimentTrend: "rising" | "falling" | "stable";
    expectationsVsPresent: number | null;
    unemploymentRate: number | null;
    joblessClaimsTrend: "rising" | "falling" | "stable";
    retailSalesTrend: "rising" | "falling" | "stable";
    savingsRate: number | null;
    confidence: number;
  };
  fearSignals: {
    composite: number;
    vix: number | null;
    vixLevel: "low" | "moderate" | "elevated" | "extreme";
    yieldCurveSpread: number | null;
    yieldCurveInverted: boolean;
    goldTrend: "rising" | "falling" | "stable";
    confidence: number;
  };
  attention: {
    publicAwareness: number;
    topTerms: string[];
    attentionMarketGap: number;
    confidence: number;
  };
}

// ---------------------------------------------------------------------------
// Cross-layer signal tensions
// ---------------------------------------------------------------------------

export interface SignalTension {
  /** Human-readable description of the tension */
  description: string;
  /** How significant is this disagreement? */
  severity: "low" | "medium" | "high";
  /** Which signal layers are in tension */
  layers: string[];
  /** Which category this applies to, or 'cross-category' */
  category: CategoryId | "cross-category";
  /** AI-generated interpretation (filled in by narrative generation) */
  implication: string | null;
}

// ---------------------------------------------------------------------------
// Adapter interface (unchanged)
// ---------------------------------------------------------------------------

export interface PlatformAdapter {
  platform: Platform;
  fetchMarkets(): Promise<NormalizedMarket[]>;
}
