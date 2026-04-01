"use client";

import useSWR from "swr";

/* ── types ── */
interface SignalReading {
  signalSource: string;
  signalId: string;
  signalName: string;
  category: string | null;
  value: number;
  previousValue: number | null;
  unit: string | null;
  recordedAt: string;
}

interface AttentionTerm {
  term: string;
  category: string;
  reason: string;
  trendValue: number | null;
  trendFetchedAt: string | null;
}

interface AttentionResponse {
  scores: {
    overall: number;
    byCategory: Record<string, number>;
    topTerms: { term: string; category: string; value: number }[];
  };
  terms: AttentionTerm[];
  meta: { totalTerms: number; fetchedTerms: number; lastCurationAge: number | null };
}

interface SignalsResponse {
  readings: SignalReading[];
  layers: unknown;
  sources: { fred: { configured: number; available: number; lastFetchAge: number | null } };
  timestamp: string;
}

interface SentimentResponse {
  index: {
    signalLayers: {
      predictionMarkets: { momentum: number; confidence: number; marketCount: number };
      economicPsychology: {
        consumerSentiment: number; consumerSentimentTrend: string;
        expectationsVsPresent: number; unemploymentRate: number;
        joblessClaimsTrend: string; retailSalesTrend: string;
        savingsRate: number; confidence: number;
      };
      fearSignals: {
        composite: number; vix: number; vixLevel: string;
        yieldCurveSpread: number; yieldCurveInverted: boolean;
        goldTrend: string; confidence: number;
      };
      attention: {
        publicAwareness: number; topTerms: string[];
        attentionMarketGap: number; confidence: number;
      };
    };
    tensions: Array<{
      description: string; severity: string;
      layers: string[]; category: string; implication: string | null;
    }>;
    categories: Array<{
      category: string; marketCount: number; momentum: number;
      activity: number; consensus: number; narrative: string;
    }>;
    narrative: string;
  };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ── interpretation helpers ── */

const SIGNAL_CONTEXT: Record<string, {
  what: string;
  goodRange: string;
  interpret: (v: number, prev: number | null) => { label: string; color: string; detail: string };
}> = {
  UMCSENT: {
    what: "University of Michigan survey — measures how optimistic consumers feel about their finances and the economy",
    goodRange: "80-100 is strong optimism, 60-80 is cautious, below 60 is pessimistic",
    interpret: (v, prev) => {
      const trend = prev ? (v > prev + 1 ? "improving" : v < prev - 1 ? "declining" : "flat") : "unknown";
      if (v >= 80) return { label: "Optimistic", color: "var(--pulse-green)", detail: `Consumers feel good about the economy (${trend})` };
      if (v >= 65) return { label: "Cautious", color: "var(--pulse-amber)", detail: `Moderate confidence — neither panic nor exuberance (${trend})` };
      if (v >= 50) return { label: "Pessimistic", color: "var(--pulse-orange)", detail: `Below the historical midpoint — consumers are worried (${trend})` };
      return { label: "Deeply Negative", color: "var(--pulse-red)", detail: `Near recessionary levels — widespread economic anxiety (${trend})` };
    },
  },
  CSCICP03USM665S: {
    what: "OECD Consumer Confidence — international composite of consumer outlook surveys",
    goodRange: "Above 100 = optimistic, below 100 = pessimistic",
    interpret: (v) => {
      if (v >= 101) return { label: "Optimistic", color: "var(--pulse-green)", detail: "International consumers expect improvement" };
      if (v >= 99) return { label: "Neutral", color: "var(--pulse-cyan)", detail: "Global consumers neither optimistic nor pessimistic" };
      return { label: "Pessimistic", color: "var(--pulse-orange)", detail: "International consumers expect deterioration" };
    },
  },
  MICH: {
    what: "Michigan Inflation Expectations — what consumers expect inflation to be over the next year",
    goodRange: "2-3% is healthy, above 4% signals anxiety about prices",
    interpret: (v) => {
      if (v <= 2.5) return { label: "Anchored", color: "var(--pulse-green)", detail: "People expect stable prices — no inflation anxiety" };
      if (v <= 3.5) return { label: "Mildly Elevated", color: "var(--pulse-amber)", detail: "Slight concern about rising costs, but within normal range" };
      if (v <= 5) return { label: "Elevated", color: "var(--pulse-orange)", detail: "Consumers actively worried about prices rising faster" };
      return { label: "Alarming", color: "var(--pulse-red)", detail: "Severe inflation anxiety — historically associated with behavioral shifts" };
    },
  },
  UNRATE: {
    what: "Bureau of Labor Statistics headline unemployment rate",
    goodRange: "3.5-4.5% is typical full employment, above 5% indicates softening",
    interpret: (v, prev) => {
      const trend = prev ? (v > prev + 0.1 ? " and rising" : v < prev - 0.1 ? " and falling" : " and stable") : "";
      if (v <= 4.0) return { label: "Tight", color: "var(--pulse-green)", detail: `Labor market is strong${trend}` };
      if (v <= 5.0) return { label: "Normal", color: "var(--pulse-amber)", detail: `Employment near historical average${trend}` };
      if (v <= 6.5) return { label: "Softening", color: "var(--pulse-orange)", detail: `Jobs becoming harder to find${trend}` };
      return { label: "Elevated", color: "var(--pulse-red)", detail: `Significant labor market stress${trend}` };
    },
  },
  ICSA: {
    what: "Weekly initial unemployment claims — the earliest signal of layoff waves",
    goodRange: "Below 225K is healthy, 250K+ suggests rising layoffs",
    interpret: (v) => {
      const vk = v / 1000;
      if (vk < 225) return { label: "Low", color: "var(--pulse-green)", detail: "Few people filing for unemployment — labor market stable" };
      if (vk < 275) return { label: "Moderate", color: "var(--pulse-amber)", detail: "Claims ticking up — could be seasonal or early sign of stress" };
      if (vk < 350) return { label: "Elevated", color: "var(--pulse-orange)", detail: "Layoff activity picking up across sectors" };
      return { label: "High", color: "var(--pulse-red)", detail: "Significant layoff wave underway" };
    },
  },
  RSAFS: {
    what: "Advance Retail Sales — total monthly consumer spending at stores and online",
    goodRange: "Month-over-month growth > 0 is positive, sustained declines signal pullback",
    interpret: (v, prev) => {
      if (!prev) return { label: "Current", color: "var(--pulse-cyan)", detail: `$${(v / 1000).toFixed(0)}B monthly retail spending` };
      const pctChange = ((v - prev) / prev) * 100;
      if (pctChange > 0.5) return { label: "Growing", color: "var(--pulse-green)", detail: `Consumers spending more (+${pctChange.toFixed(1)}%) — confidence in action` };
      if (pctChange > -0.5) return { label: "Flat", color: "var(--pulse-amber)", detail: "Consumer spending holding steady" };
      return { label: "Declining", color: "var(--pulse-orange)", detail: `Spending pulled back (${pctChange.toFixed(1)}%) — consumers tightening belts` };
    },
  },
  PSAVERT: {
    what: "Personal Savings Rate — what % of income people are saving vs. spending",
    goodRange: "5-8% is healthy, below 4% means stretched finances, above 10% signals fear-driven hoarding",
    interpret: (v) => {
      if (v >= 10) return { label: "Hoarding", color: "var(--pulse-amber)", detail: "People saving aggressively — often signals recession fear" };
      if (v >= 6) return { label: "Healthy", color: "var(--pulse-green)", detail: "Balanced saving — consumers feel secure enough to spend but prudent" };
      if (v >= 4) return { label: "Stretched", color: "var(--pulse-orange)", detail: "Low cushion — consumers spending most of what they earn" };
      return { label: "Depleted", color: "var(--pulse-red)", detail: "Minimal savings buffer — any shock would hit households hard" };
    },
  },
  NFCI: {
    what: "Chicago Fed National Financial Conditions Index — measures stress in money, debt, and equity markets",
    goodRange: "Negative = loose (easy money), positive = tight (stress). Zero is average",
    interpret: (v) => {
      if (v < -0.5) return { label: "Very Loose", color: "var(--pulse-green)", detail: "Money flowing freely — financial system under no stress" };
      if (v < 0) return { label: "Loose", color: "var(--pulse-cyan)", detail: "Financial conditions accommodative — credit available" };
      if (v < 0.5) return { label: "Tightening", color: "var(--pulse-amber)", detail: "Conditions starting to restrict — borrowing getting harder" };
      return { label: "Tight", color: "var(--pulse-red)", detail: "Significant financial stress — credit contracting" };
    },
  },
  VIXCLS: {
    what: "CBOE Volatility Index — Wall Street's \"fear gauge,\" measures expected stock market turbulence",
    goodRange: "Below 15 is calm, 15-20 is normal, 20-30 is elevated, 30+ is fear",
    interpret: (v) => {
      if (v < 15) return { label: "Calm", color: "var(--pulse-green)", detail: "Markets see smooth sailing ahead — very little hedging activity" };
      if (v < 20) return { label: "Normal", color: "var(--pulse-cyan)", detail: "Typical level of uncertainty — no unusual anxiety" };
      if (v < 25) return { label: "Elevated", color: "var(--pulse-amber)", detail: "Above-average anxiety — traders buying more protection" };
      if (v < 30) return { label: "High", color: "var(--pulse-orange)", detail: "Significant fear — institutional investors actively hedging downside" };
      return { label: "Extreme", color: "var(--pulse-red)", detail: "Panic-level fear — historically associated with major market events" };
    },
  },
  T10Y2Y: {
    what: "10-Year minus 2-Year Treasury spread — the classic recession predictor",
    goodRange: "Positive = normal. Negative (inverted) has preceded every recession since 1970",
    interpret: (v) => {
      if (v < -0.5) return { label: "Deeply Inverted", color: "var(--pulse-red)", detail: "Strong recession signal — bond market pricing in economic contraction" };
      if (v < 0) return { label: "Inverted", color: "var(--pulse-orange)", detail: "Yield curve inverted — historically precedes recessions by 6-18 months" };
      if (v < 0.25) return { label: "Flat", color: "var(--pulse-amber)", detail: "Nearly flat — approaching inversion territory, elevated recession risk" };
      if (v < 1.0) return { label: "Mildly Positive", color: "var(--pulse-cyan)", detail: "Slightly positive slope — some caution but no recession signal" };
      return { label: "Normal", color: "var(--pulse-green)", detail: "Healthy positive slope — bond market sees economic expansion" };
    },
  },
  BAMLH0A0HYM2: {
    what: "High Yield Bond Spread — premium investors demand for risky corporate debt over safe Treasuries",
    goodRange: "Below 3% is tight (confident), 3-5% is normal, 5%+ signals credit stress",
    interpret: (v) => {
      if (v < 3) return { label: "Tight", color: "var(--pulse-green)", detail: "Investors very willing to lend to risky companies — high confidence" };
      if (v < 4) return { label: "Normal", color: "var(--pulse-cyan)", detail: "Typical risk premium — no unusual credit concern" };
      if (v < 5) return { label: "Widening", color: "var(--pulse-amber)", detail: "Investors demanding more compensation for risk — caution emerging" };
      if (v < 7) return { label: "Stressed", color: "var(--pulse-orange)", detail: "Significant credit anxiety — borrowing costs rising for weaker companies" };
      return { label: "Crisis", color: "var(--pulse-red)", detail: "Credit market near-freeze — severe financial stress" };
    },
  },
  PPIACO: {
    what: "Producer Price Index — wholesale costs that eventually flow through to consumer prices",
    goodRange: "Rising PPI often leads rising consumer inflation by 2-6 months",
    interpret: (v, prev) => {
      if (!prev) return { label: "Current", color: "var(--pulse-cyan)", detail: `Producer price index at ${v.toFixed(1)}` };
      const pctChange = ((v - prev) / prev) * 100;
      if (pctChange > 1) return { label: "Rising Fast", color: "var(--pulse-red)", detail: `Wholesale costs surging (+${pctChange.toFixed(1)}%) — inflation pressure building` };
      if (pctChange > 0.2) return { label: "Rising", color: "var(--pulse-amber)", detail: `Input costs climbing (+${pctChange.toFixed(1)}%) — may feed through to consumer prices` };
      if (pctChange > -0.2) return { label: "Stable", color: "var(--pulse-green)", detail: "Producer costs flat — no new inflation pressure" };
      return { label: "Falling", color: "var(--pulse-cyan)", detail: `Wholesale costs declining (${pctChange.toFixed(1)}%) — deflationary signal` };
    },
  },
  DTWEXBGS: {
    what: "Trade-Weighted US Dollar Index — measures the dollar's value against major trading partners",
    goodRange: "Rising dollar = tighter global conditions. Falling = easier",
    interpret: (v, prev) => {
      if (!prev) return { label: "Current", color: "var(--pulse-cyan)", detail: `Dollar index at ${v.toFixed(1)}` };
      const pctChange = ((v - prev) / prev) * 100;
      if (pctChange > 0.5) return { label: "Strengthening", color: "var(--pulse-amber)", detail: `Dollar gaining (+${pctChange.toFixed(1)}%) — tighter conditions globally, stress on emerging markets` };
      if (pctChange > -0.5) return { label: "Stable", color: "var(--pulse-green)", detail: "Dollar broadly unchanged — no major shift in global financial conditions" };
      return { label: "Weakening", color: "var(--pulse-cyan)", detail: `Dollar falling (${pctChange.toFixed(1)}%) — easing global conditions` };
    },
  },
};

const LAYER_LABELS: Record<string, string> = {
  predictionMarkets: "Prediction Markets",
  economicPsychology: "Economic Psychology",
  fearSignals: "Fear Signals",
  attention: "Attention",
};

function formatValue(id: string, v: number): string {
  if (id === "ICSA") return `${(v / 1000).toFixed(0)}K`;
  if (id === "RSAFS") return `$${(v / 1000).toFixed(0)}B`;
  if (id === "DTWEXBGS") return v.toFixed(1);
  if (id === "PPIACO") return v.toFixed(1);
  if (["UMCSENT", "CSCICP03USM665S"].includes(id)) return v.toFixed(1);
  if (["PSAVERT", "UNRATE", "MICH", "BAMLH0A0HYM2"].includes(id)) return `${v.toFixed(1)}%`;
  if (id === "VIXCLS") return v.toFixed(2);
  if (id === "T10Y2Y") return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  if (id === "NFCI") return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  return v.toFixed(2);
}

/* ── Signal Card ── */
function SignalCard({ reading }: { reading: SignalReading }) {
  const ctx = SIGNAL_CONTEXT[reading.signalId];
  if (!ctx) return null;

  const interp = ctx.interpret(reading.value, reading.previousValue);
  const age = Date.now() - new Date(reading.recordedAt).getTime();
  const ageStr = age < 3600000 ? `${Math.round(age / 60000)}m ago` : age < 86400000 ? `${Math.round(age / 3600000)}h ago` : `${Math.round(age / 86400000)}d ago`;

  return (
    <div className="rounded-xl border border-border-pulse bg-surface-1 p-4">
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-medium text-zinc-200">{reading.signalName}</h4>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{ctx.what}</p>
        </div>
        <div className="ml-3 shrink-0 text-right">
          <span
            className="text-lg font-bold"
            style={{ fontFamily: "var(--font-jetbrains-mono)", color: interp.color }}
          >
            {formatValue(reading.signalId, reading.value)}
          </span>
          {reading.previousValue !== null && (
            <div className="text-[10px] text-zinc-600" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              prev: {formatValue(reading.signalId, reading.previousValue)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
          style={{
            fontFamily: "var(--font-space-mono)",
            color: interp.color,
            backgroundColor: `color-mix(in srgb, ${interp.color} 12%, transparent)`,
          }}
        >
          {interp.label}
        </span>
        <span className="flex-1 text-[11px] text-zinc-400">{interp.detail}</span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[9px] text-zinc-600" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
          {ctx.goodRange}
        </span>
        <span className="text-[9px] text-zinc-600" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
          {ageStr}
        </span>
      </div>
    </div>
  );
}

/* ── Attention Section ── */
function AttentionInsights({
  terms,
  scores,
  meta,
}: {
  terms: AttentionTerm[];
  scores: AttentionResponse["scores"] | undefined;
  meta: AttentionResponse["meta"] | undefined;
}) {
  if (!terms.length) {
    return (
      <div className="rounded-xl border border-border-pulse bg-surface-1 p-6 text-center">
        <p className="text-xs text-zinc-500">No attention terms yet. AI curates 20 search terms hourly based on market activity.</p>
      </div>
    );
  }

  const highAttention = terms.filter((t) => t.trendValue !== null && t.trendValue > 50);
  const lowAttention = terms.filter((t) => t.trendValue !== null && t.trendValue <= 20 && t.trendValue > 0);
  const noData = terms.filter((t) => t.trendValue === null);

  const CATEGORY_ICONS: Record<string, string> = {
    politics: "🏛️", finance: "📈", crypto: "₿",
    tech: "💻", culture: "🎭", geopolitics: "🌍",
  };

  return (
    <div className="space-y-4">
      {/* Attention overview */}
      <div className="rounded-xl border border-border-pulse bg-surface-1 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[13px] font-medium text-zinc-200">Public Attention Overview</h4>
          {meta && (
            <span className="text-[10px] text-zinc-600" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              {meta.totalTerms} terms · {meta.fetchedTerms} measured
            </span>
          )}
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
          Claude generates search terms based on what prediction markets are pricing, then measures Google Trends interest.
          High scores = the public is paying attention. Low scores = informed bettors may know something the public doesn&apos;t.
        </p>

        {scores && (
          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                color: "var(--pulse-orange)",
                backgroundColor: "color-mix(in srgb, var(--pulse-orange) 12%, transparent)",
              }}
            >
              Overall Awareness: {scores.overall}/100
            </span>
            {Object.entries(scores.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, score]) => (
                <span
                  key={cat}
                  className="rounded-lg bg-surface-3 px-2.5 py-1 text-[10px] text-zinc-400"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {CATEGORY_ICONS[cat] ?? ""} {cat}: {score}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* High attention */}
      {highAttention.length > 0 && (
        <div className="rounded-xl border border-border-pulse bg-surface-1 p-4">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-pulse-orange" style={{ fontFamily: "var(--font-space-mono)" }}>
            High Public Interest
          </h4>
          <p className="mb-3 text-[10px] text-zinc-500">These topics have strong search volume — the public is actively engaged.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {highAttention.sort((a, b) => (b.trendValue ?? 0) - (a.trendValue ?? 0)).map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-zinc-300">{t.term}</p>
                  <p className="text-[9px] text-zinc-600">{CATEGORY_ICONS[t.category] ?? ""} {t.category} — {t.reason}</p>
                </div>
                <span className="ml-2 text-sm font-bold" style={{ fontFamily: "var(--font-jetbrains-mono)", color: "var(--pulse-orange)" }}>
                  {t.trendValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low attention — the insight gap */}
      {lowAttention.length > 0 && (
        <div className="rounded-xl border border-border-pulse bg-surface-1 p-4">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-pulse-cyan" style={{ fontFamily: "var(--font-space-mono)" }}>
            Under the Radar
          </h4>
          <p className="mb-3 text-[10px] text-zinc-500">
            Markets are pricing these topics, but search interest is low — potential blind spots where informed bettors see something the public hasn&apos;t noticed.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {lowAttention.sort((a, b) => (a.trendValue ?? 0) - (b.trendValue ?? 0)).map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-zinc-300">{t.term}</p>
                  <p className="text-[9px] text-zinc-600">{CATEGORY_ICONS[t.category] ?? ""} {t.category} — {t.reason}</p>
                </div>
                <span className="ml-2 text-sm font-bold text-zinc-600" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  {t.trendValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remaining terms */}
      {(() => {
        const midTerms = terms.filter(
          (t) => t.trendValue !== null && t.trendValue > 20 && t.trendValue <= 50,
        );
        if (!midTerms.length) return null;
        return (
          <div className="rounded-xl border border-border-pulse bg-surface-1 p-4">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400" style={{ fontFamily: "var(--font-space-mono)" }}>
              Moderate Interest
            </h4>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {midTerms.sort((a, b) => (b.trendValue ?? 0) - (a.trendValue ?? 0)).map((t, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-zinc-400">{t.term}</p>
                    <p className="text-[9px] text-zinc-600">{CATEGORY_ICONS[t.category] ?? ""} {t.category}</p>
                  </div>
                  <span className="ml-2 text-xs font-semibold text-zinc-500" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                    {t.trendValue}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {noData.length > 0 && (
        <p className="text-center text-[10px] text-zinc-600">
          {noData.length} terms awaiting Google Trends measurement
        </p>
      )}
    </div>
  );
}

/* ── Cross-Signal Synthesis ── */
function CrossSignalSynthesis({ sentiment }: { sentiment: SentimentResponse["index"] }) {
  const layers = sentiment.signalLayers;
  const tensions = sentiment.tensions ?? [];

  return (
    <div className="rounded-xl border border-pulse-amber/20 bg-surface-1 p-5">
      <h3
        className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-pulse-amber"
        style={{ fontFamily: "var(--font-space-mono)" }}
      >
        Cross-Signal Analysis
      </h3>

      {/* Quick summary of all 4 layers */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Markets Say",
            value: layers.predictionMarkets.momentum > 15 ? "Optimistic" : layers.predictionMarkets.momentum > -15 ? "Mixed" : "Pessimistic",
            detail: `${layers.predictionMarkets.marketCount} markets, momentum ${layers.predictionMarkets.momentum > 0 ? "+" : ""}${layers.predictionMarkets.momentum}`,
            color: layers.predictionMarkets.momentum > 15 ? "var(--pulse-green)" : layers.predictionMarkets.momentum > -15 ? "var(--pulse-amber)" : "var(--pulse-red)",
          },
          {
            label: "Consumers Feel",
            value: layers.economicPsychology.consumerSentiment >= 70 ? "Confident" : layers.economicPsychology.consumerSentiment >= 55 ? "Uneasy" : "Worried",
            detail: `Sentiment ${layers.economicPsychology.consumerSentiment}, ${layers.economicPsychology.consumerSentimentTrend}`,
            color: layers.economicPsychology.consumerSentiment >= 70 ? "var(--pulse-green)" : layers.economicPsychology.consumerSentiment >= 55 ? "var(--pulse-amber)" : "var(--pulse-red)",
          },
          {
            label: "Wall Street Fears",
            value: layers.fearSignals.vixLevel === "calm" ? "Calm" : layers.fearSignals.vixLevel === "elevated" ? "Elevated" : "High",
            detail: `VIX ${layers.fearSignals.vix}, yield spread ${layers.fearSignals.yieldCurveSpread >= 0 ? "+" : ""}${layers.fearSignals.yieldCurveSpread.toFixed(2)}`,
            color: layers.fearSignals.vixLevel === "calm" ? "var(--pulse-green)" : layers.fearSignals.vixLevel === "elevated" ? "var(--pulse-amber)" : "var(--pulse-red)",
          },
          {
            label: "Public Watching",
            value: layers.attention.publicAwareness > 50 ? "Alert" : layers.attention.publicAwareness > 25 ? "Distracted" : "Asleep",
            detail: `Awareness ${layers.attention.publicAwareness}/100, gap ${layers.attention.attentionMarketGap}`,
            color: layers.attention.publicAwareness > 50 ? "var(--pulse-green)" : layers.attention.publicAwareness > 25 ? "var(--pulse-amber)" : "var(--pulse-red)",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-surface-2 p-3">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500" style={{ fontFamily: "var(--font-space-mono)" }}>{item.label}</p>
            <p className="mt-1 text-[14px] font-bold" style={{ color: item.color }}>{item.value}</p>
            <p className="mt-0.5 text-[10px] text-zinc-500" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{item.detail}</p>
          </div>
        ))}
      </div>

      {/* Tensions */}
      {tensions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400" style={{ fontFamily: "var(--font-space-mono)" }}>
            Signal Tensions ({tensions.length})
          </h4>
          {tensions.map((t, i) => {
            const severityColor =
              t.severity === "high" ? "var(--pulse-red)" : t.severity === "medium" ? "var(--pulse-amber)" : "var(--pulse-cyan)";
            return (
              <div key={i} className="rounded-lg bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    style={{
                      fontFamily: "var(--font-space-mono)",
                      color: severityColor,
                      backgroundColor: `color-mix(in srgb, ${severityColor} 12%, transparent)`,
                    }}
                  >
                    {t.severity}
                  </span>
                  {t.layers.map((l) => (
                    <span key={l} className="text-[9px] text-zinc-600">
                      {LAYER_LABELS[l] ?? l}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-300">{t.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export function SignalDeepDive() {
  const { data: signalsData } = useSWR<SignalsResponse>("/api/signals", fetcher, { refreshInterval: 60000 });
  const { data: attentionData } = useSWR<AttentionResponse>("/api/attention", fetcher, { refreshInterval: 60000 });
  const { data: sentimentData } = useSWR<SentimentResponse>("/api/sentiment", fetcher, { refreshInterval: 60000 });

  const signals = signalsData?.readings ?? [];

  const EP_IDS = new Set(["UMCSENT", "CSCICP03USM665S", "MICH", "UNRATE", "ICSA", "RSAFS", "PSAVERT", "NFCI"]);
  const FEAR_IDS = new Set(["VIXCLS", "T10Y2Y", "BAMLH0A0HYM2", "PPIACO", "DTWEXBGS"]);
  const epSignals = signals.filter((s) => EP_IDS.has(s.signalId));
  const fearSignals = signals.filter((s) => FEAR_IDS.has(s.signalId));

  const terms = attentionData?.terms ?? [];
  const scores = attentionData?.scores;
  const meta = attentionData?.meta;

  const noData = signals.length === 0 && terms.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-5">
        <h2 className="mb-1 text-lg font-semibold text-zinc-200">Signal Deep-Dive</h2>
        <p className="text-[12px] leading-relaxed text-zinc-500">
          Every number below feeds into PULSE&apos;s composite view. Each signal measures a different dimension of
          how society feels — from what informed bettors believe, to how anxious Wall Street is, to whether
          the public is even paying attention.
        </p>
      </div>

      {noData && (
        <div className="rounded-xl border border-border-pulse bg-surface-1 p-8 text-center">
          <p className="text-sm text-zinc-400">Waiting for data...</p>
          <p className="mt-1 text-xs text-zinc-600">FRED signals update on the hourly cron cycle. Attention terms are AI-curated hourly.</p>
        </div>
      )}

      {/* Cross-signal synthesis */}
      {sentimentData && <CrossSignalSynthesis sentiment={sentimentData.index} />}

      {/* Economic Psychology */}
      {epSignals.length > 0 && (
        <div>
          <h3
            className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-pulse-purple"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-pulse-purple" />
            Layer 2: Economic Psychology — How Ordinary People Feel
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Sort so most important signals come first */}
            {["UMCSENT", "UNRATE", "ICSA", "MICH", "PSAVERT", "RSAFS", "CSCICP03USM665S", "NFCI"]
              .map((id) => epSignals.find((s) => s.signalId === id))
              .filter(Boolean)
              .map((s) => (
                <SignalCard key={s!.signalId} reading={s!} />
              ))}
          </div>
        </div>
      )}

      {/* Fear Signals */}
      {fearSignals.length > 0 && (
        <div>
          <h3
            className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-pulse-amber"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-pulse-amber" />
            Layer 3: Fear Signals — What Wall Street Is Anxious About
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {["VIXCLS", "T10Y2Y", "BAMLH0A0HYM2", "PPIACO", "DTWEXBGS"]
              .map((id) => fearSignals.find((s) => s.signalId === id))
              .filter(Boolean)
              .map((s) => (
                <SignalCard key={s!.signalId} reading={s!} />
              ))}
          </div>
        </div>
      )}

      {/* Attention Layer */}
      <div>
        <h3
          className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-pulse-orange"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-pulse-orange" />
          Layer 4: Public Attention — What People Are Actually Searching
        </h3>
        <AttentionInsights terms={terms} scores={scores} meta={meta} />
      </div>
    </div>
  );
}
