"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import type { SignalLayersData } from "@/lib/platforms/types";

interface SignalQuadrantsProps {
  signals: SignalLayersData | null | undefined;
}

function MiniGauge({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-16 text-right text-[10px] text-zinc-500"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="w-8 text-[10px] font-medium"
        style={{ fontFamily: "var(--font-jetbrains-mono)", color }}
      >
        {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : "—"}
      </span>
    </div>
  );
}

function DataRow({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between text-[10px]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
      <span className="text-zinc-500">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span style={{ color: color ?? undefined }} className={color ? "" : "text-zinc-300"}>
          {value}
        </span>
        {detail && (
          <span className="text-[9px] text-zinc-600">{detail}</span>
        )}
      </div>
    </div>
  );
}

function QuadrantCard({
  title,
  subtitle,
  description,
  color,
  confidence,
  summary,
  children,
  info,
}: {
  title: string;
  subtitle: string;
  description: string;
  color: string;
  confidence: number;
  summary: string;
  children: React.ReactNode;
  info: string;
}) {
  return (
    <div
      className="rounded-xl border border-border-pulse bg-surface-1 p-4"
      style={{ boxShadow: `0 0 20px ${color}08, inset 0 1px 0 ${color}10` }}
    >
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            {title}
          </h3>
          <p className="mt-0.5 text-[10px] text-zinc-600">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <InfoTip text={info} />
          <span
            className="rounded px-1.5 py-0.5 text-[9px]"
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              color: confidence > 60 ? "var(--pulse-green)" : confidence > 30 ? "var(--pulse-amber)" : "var(--pulse-red)",
              backgroundColor: confidence > 60 ? "rgba(42,157,143,0.1)" : confidence > 30 ? "rgba(245,158,11,0.1)" : "rgba(230,57,70,0.1)",
            }}
          >
            {confidence}% conf
          </span>
        </div>
      </div>

      {/* Visible explainer */}
      <p className="mb-3 text-[10px] leading-relaxed text-zinc-500">
        {description}
      </p>

      <div className="space-y-2">{children}</div>

      {/* Bottom-line interpretation */}
      <div
        className="mt-3 rounded-lg px-3 py-2 text-[10px] leading-relaxed"
        style={{ backgroundColor: `${color}08`, color: `${color}dd` }}
      >
        {summary}
      </div>
    </div>
  );
}

function trendArrow(trend: string): string {
  if (trend === "rising") return " ↑";
  if (trend === "falling") return " ↓";
  return " →";
}

function vixColor(level: string): string {
  if (level === "low") return "var(--pulse-green)";
  if (level === "moderate") return "var(--pulse-cyan)";
  if (level === "elevated") return "var(--pulse-amber)";
  return "var(--pulse-red)";
}

// -- Interpretive helpers --

function sentimentReading(momentum: number): string {
  if (momentum >= 20) return "strongly optimistic";
  if (momentum >= 5) return "leaning optimistic";
  if (momentum > -5) return "neutral — no clear direction";
  if (momentum > -20) return "leaning pessimistic";
  return "strongly pessimistic";
}

function marketsSummary(pm: SignalLayersData["predictionMarkets"]): string {
  const direction = sentimentReading(pm.momentum);
  return `Across ${pm.marketCount.toLocaleString()} tracked questions, collective belief is ${direction}. Momentum measures how quickly confidence is shifting across all markets.`;
}

function consumerSentimentLevel(value: number | null): string {
  if (value === null) return "";
  // UMCSENT historical context: 50-60 = pessimistic range, 60-80 = normal, 80-100 = optimistic, 100+ = very optimistic
  if (value >= 95) return "very optimistic";
  if (value >= 80) return "optimistic";
  if (value >= 65) return "average";
  if (value >= 55) return "below average";
  return "pessimistic";
}

function economySummary(ep: SignalLayersData["economicPsychology"]): string {
  const level = consumerSentimentLevel(ep.consumerSentiment);
  const sentimentPart = ep.consumerSentiment ? `Consumer sentiment at ${ep.consumerSentiment} is ${level}` : "Consumer sentiment data unavailable";
  const jobsPart = ep.unemploymentRate !== null ? `. Unemployment at ${ep.unemploymentRate}%` : "";
  const claimsPart = ep.joblessClaimsTrend !== "stable" ? `, jobless claims ${ep.joblessClaimsTrend}` : "";
  return `${sentimentPart}${jobsPart}${claimsPart}. These surveys measure how ordinary people feel about their economic future.`;
}

function fearSummary(fs: SignalLayersData["fearSignals"]): string {
  const vixDesc = fs.vixLevel === "low" ? "calm" : fs.vixLevel === "moderate" ? "moderate" : fs.vixLevel === "elevated" ? "elevated" : "extreme";
  const yieldPart = fs.yieldCurveInverted ? " The yield curve is inverted — historically the strongest recession predictor." : "";
  return `Market fear is ${vixDesc} with VIX at ${fs.vix ?? "—"}.${yieldPart} These are the fastest-moving signals — they react to breaking events before other layers.`;
}

function attentionSummary(attn: SignalLayersData["attention"]): string {
  const gapLevel = attn.attentionMarketGap > 50 ? "large" : attn.attentionMarketGap > 25 ? "moderate" : "small";
  const gapMeaning = attn.attentionMarketGap > 40
    ? "Informed bettors may be seeing something the general public hasn't noticed yet."
    : "Public attention roughly tracks what markets are pricing.";
  return `AI-curated Google searches show ${gapLevel} gap (${attn.attentionMarketGap}) between market activity and public awareness. ${gapMeaning}`;
}

export function SignalQuadrants({ signals }: SignalQuadrantsProps) {
  if (!signals) {
    return (
      <div className="rounded-xl border border-border-pulse bg-surface-1 p-6 text-center">
        <p className="text-xs text-zinc-600">Signal layer data not yet available</p>
      </div>
    );
  }

  const pm = signals.predictionMarkets;
  const ep = signals.economicPsychology;
  const fs = signals.fearSignals;
  const attn = signals.attention;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Quadrant 1: What They Believe */}
      <QuadrantCard
        title="What They Believe"
        subtitle="Prediction Markets"
        description="What informed communities believe will happen, backed by real financial stakes across Polymarket, Kalshi, PredictIt, and Manifold."
        color="var(--pulse-blue)"
        confidence={pm.confidence}
        summary={marketsSummary(pm)}
        info="Stakes-based belief is the leading indicator. People put money behind their predictions — making this the most honest signal of what informed communities expect to happen."
      >
        <MiniGauge
          value={(pm.momentum + 100) / 2}
          max={100}
          color="var(--pulse-blue)"
          label="Sentiment"
        />
        <DataRow
          label="Momentum"
          value={`${pm.momentum > 0 ? "+" : ""}${pm.momentum}`}
          detail={sentimentReading(pm.momentum)}
          color={pm.momentum >= 0 ? "var(--pulse-green)" : "var(--pulse-red)"}
        />
        <DataRow
          label="Markets Tracked"
          value={pm.marketCount.toLocaleString()}
          detail="questions"
        />
      </QuadrantCard>

      {/* Quadrant 2: How They Feel */}
      <QuadrantCard
        title="How They Feel"
        subtitle="Economic Psychology"
        description="How ordinary people feel about the economy — based on University of Michigan surveys, employment data, and spending behavior from the Federal Reserve."
        color="var(--pulse-purple)"
        confidence={ep.confidence}
        summary={economySummary(ep)}
        info="Economic psychology is a lagging indicator. It tells you how the average person feels RIGHT NOW about their finances and the future — often trailing what prediction markets have already priced in."
      >
        <DataRow
          label="Consumer Sentiment"
          value={<>{ep.consumerSentiment ?? "—"}{trendArrow(ep.consumerSentimentTrend)}</>}
          detail={consumerSentimentLevel(ep.consumerSentiment)}
        />
        <DataRow
          label="Unemployment"
          value={ep.unemploymentRate !== null ? `${ep.unemploymentRate}%` : "—"}
        />
        <DataRow
          label="Jobless Claims"
          value={trendArrow(ep.joblessClaimsTrend).trim()}
          detail={ep.joblessClaimsTrend}
        />
        <DataRow
          label="Savings Rate"
          value={ep.savingsRate !== null ? `${ep.savingsRate}%` : "—"}
          detail={ep.savingsRate !== null ? (ep.savingsRate > 8 ? "hoarding cash" : ep.savingsRate < 4 ? "spending freely" : "normal range") : undefined}
        />
      </QuadrantCard>

      {/* Quadrant 3: What They Fear */}
      <QuadrantCard
        title="What They Fear"
        subtitle="Fear Signals"
        description="Acute anxiety across financial markets — VIX (Wall Street's fear gauge), yield curve (recession predictor), credit spreads, and commodity prices from FRED."
        color={vixColor(fs.vixLevel)}
        confidence={fs.confidence}
        summary={fearSummary(fs)}
        info="Fear signals are the real-time indicator. They're the first layer to react to breaking events. A VIX spike + yield curve inversion + gold surge often signals trouble before other layers move."
      >
        <MiniGauge
          value={fs.composite}
          max={100}
          color={vixColor(fs.vixLevel)}
          label="Fear"
        />
        <DataRow
          label="VIX"
          value={<>{fs.vix ?? "—"}</>}
          detail={fs.vixLevel}
          color={vixColor(fs.vixLevel)}
        />
        <DataRow
          label="Yield Curve"
          value={<>{fs.yieldCurveSpread !== null ? `${fs.yieldCurveSpread}%` : "—"}{fs.yieldCurveInverted ? " INVERTED" : ""}</>}
          color={fs.yieldCurveInverted ? "var(--pulse-red)" : undefined}
          detail={fs.yieldCurveInverted ? "recession signal" : fs.yieldCurveSpread !== null && fs.yieldCurveSpread < 0.5 ? "nearly flat" : "normal"}
        />
        <DataRow
          label="Commodities"
          value={<>{fs.goldTrend}{trendArrow(fs.goldTrend)}</>}
          detail={fs.goldTrend === "rising" ? "flight to safety" : fs.goldTrend === "falling" ? "risk appetite" : "stable"}
        />
      </QuadrantCard>

      {/* Quadrant 4: What They're Watching */}
      <QuadrantCard
        title="What They're Watching"
        subtitle="Public Attention (AI-Curated)"
        description="What the general public is searching for on Google — terms dynamically chosen by AI based on what prediction markets and economic data are currently showing."
        color="var(--pulse-orange)"
        confidence={attn.confidence}
        summary={attentionSummary(attn)}
        info="The gap between what markets are pricing and what the public is searching for is a key signal. When bettors see something the public hasn't noticed, it often signals a coming shift in public awareness."
      >
        <MiniGauge
          value={attn.publicAwareness}
          max={100}
          color="var(--pulse-orange)"
          label="Awareness"
        />
        <DataRow
          label="Market Gap"
          value={attn.attentionMarketGap}
          detail={attn.attentionMarketGap > 50 ? "public unaware" : attn.attentionMarketGap > 25 ? "partial awareness" : "aligned"}
          color={attn.attentionMarketGap > 40 ? "var(--pulse-amber)" : "var(--pulse-green)"}
        />
        {attn.topTerms.length > 0 && (
          <div className="mt-1">
            <p className="mb-1 text-[9px] text-zinc-600" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              Top searches (AI-curated):
            </p>
            <div className="flex flex-wrap gap-1">
              {attn.topTerms.slice(0, 5).map((term) => (
                <span
                  key={term}
                  className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-zinc-400"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {term}
                </span>
              ))}
            </div>
          </div>
        )}
      </QuadrantCard>
    </div>
  );
}
