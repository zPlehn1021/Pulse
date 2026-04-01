"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  AreaChart,
  BarChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

/* ── Types ── */
interface HistoryResponse {
  sentimentHistory: Array<{
    timestamp: string;
    composite: number;
    totalMarkets: number;
    politics?: number;
    finance?: number;
    crypto?: number;
    tech?: number;
    culture?: number;
    geopolitics?: number;
  }>;
  signalHistory: Record<
    string,
    { name: string; readings: { value: number; timestamp: string }[] }
  >;
  marketActivity: Array<{
    hour: string;
    pricePoints: number;
    uniqueMarkets: number;
    avgPrice: number;
  }>;
  attentionHistory: Array<{
    hour: string;
    avgTrend: number;
    highInterest: number;
    lowInterest: number;
    totalTerms: number;
  }>;
  meta: {
    snapshotCount: number;
    signalReadingCount: number;
    pricePointCount: number;
    dataRange: { from: string | null; to: string | null };
  };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ── Color Palette ── */
const COLORS = {
  composite: "#22d3ee",      // cyan
  politics: "#f87171",       // red
  finance: "#34d399",        // green
  crypto: "#fbbf24",         // amber
  tech: "#a78bfa",           // purple
  culture: "#fb923c",        // orange
  geopolitics: "#38bdf8",    // sky
  vix: "#f87171",
  yieldCurve: "#fbbf24",
  consumerSentiment: "#a78bfa",
  unemployment: "#fb923c",
  bondSpread: "#22d3ee",
  grid: "#27272a",
  text: "#71717a",
  reference: "#3f3f46",
};

const CATEGORY_NAMES: Record<string, string> = {
  politics: "Politics",
  finance: "Finance",
  crypto: "Crypto",
  tech: "Tech",
  culture: "Culture",
  geopolitics: "Geopolitics",
};

/* ── Formatters ── */
function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays < 1) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── Custom Tooltip ── */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border-pulse bg-surface-0 px-3 py-2 shadow-xl">
      <p
        className="mb-1 text-[10px] text-zinc-500"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        {label ? formatDate(label) : ""}
      </p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[11px] text-zinc-400">{p.name}:</span>
          <span
            className="text-[11px] font-semibold text-zinc-200"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Chart Section Wrapper ── */
function ChartSection({
  title,
  subtitle,
  color,
  children,
  empty,
}: {
  title: string;
  subtitle: string;
  color: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-pulse bg-surface-1 p-5">
      <div className="mb-4">
        <h3
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ fontFamily: "var(--font-space-mono)", color }}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {title}
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{subtitle}</p>
      </div>
      {empty ? (
        <div className="flex h-48 items-center justify-center rounded-lg bg-surface-2">
          <p className="text-xs text-zinc-600">
            Building history... Data points accumulate every 5-minute cron cycle.
          </p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/* ── Signal Overlay Chart ── */
function SignalOverlayChart({
  signalHistory,
}: {
  signalHistory: HistoryResponse["signalHistory"];
}) {
  const FEAR_SIGNALS = ["VIXCLS", "T10Y2Y", "BAMLH0A0HYM2"];
  const ECONOMY_SIGNALS = ["UMCSENT", "UNRATE", "ICSA"];

  const [activeGroup, setActiveGroup] = useState<"fear" | "economy">("fear");

  const signalIds = activeGroup === "fear" ? FEAR_SIGNALS : ECONOMY_SIGNALS;
  const availableSignals = signalIds.filter((id) => signalHistory[id]?.readings?.length > 0);

  if (availableSignals.length === 0) return null;

  // Normalize all signals to 0-100 scale for overlay comparison
  const normalizeSignal = (id: string): { timestamp: string; value: number; raw: number }[] => {
    const readings = signalHistory[id]?.readings ?? [];
    if (readings.length === 0) return [];

    const values = readings.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return readings.map((r) => ({
      timestamp: r.timestamp,
      value: ((r.value - min) / range) * 100,
      raw: r.value,
    }));
  };

  // Merge all signals into unified timeline
  const allTimestamps = new Set<string>();
  availableSignals.forEach((id) => {
    signalHistory[id]?.readings?.forEach((r) => allTimestamps.add(r.timestamp));
  });

  const sortedTimestamps = [...allTimestamps].sort();
  const mergedData = sortedTimestamps.map((ts) => {
    const point: Record<string, unknown> = { timestamp: ts };
    availableSignals.forEach((id) => {
      const normalized = normalizeSignal(id);
      const match = normalized.find((r) => r.timestamp === ts);
      if (match) {
        point[id] = match.value;
        point[`${id}_raw`] = match.raw;
      }
    });
    return point;
  });

  const signalColors: Record<string, string> = {
    VIXCLS: COLORS.vix,
    T10Y2Y: COLORS.yieldCurve,
    BAMLH0A0HYM2: COLORS.bondSpread,
    UMCSENT: COLORS.consumerSentiment,
    UNRATE: COLORS.unemployment,
    ICSA: COLORS.culture,
  };

  return (
    <ChartSection
      title="Signal Layer Overlay"
      subtitle="Signals normalized to 0-100 scale for comparison. See how fear, economic, and market signals move relative to each other over time."
      color="var(--pulse-cyan)"
    >
      <div className="mb-3 flex gap-2">
        {(["fear", "economy"] as const).map((group) => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase transition-colors"
            style={{
              fontFamily: "var(--font-space-mono)",
              color: activeGroup === group ? "#fff" : "var(--text-tertiary)",
              backgroundColor: activeGroup === group ? "var(--surface-3)" : "transparent",
            }}
          >
            {group === "fear" ? "Fear Signals" : "Economy"}
          </button>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedData}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              stroke={COLORS.text}
              tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
            />
            <YAxis
              domain={[0, 100]}
              stroke={COLORS.text}
              tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
              label={{ value: "Normalized (0-100)", angle: -90, position: "insideLeft", style: { fontSize: 9, fill: COLORS.text } }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-space-mono)" }}
            />
            {availableSignals.map((id) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={signalHistory[id]?.name ?? id}
                stroke={signalColors[id] ?? COLORS.composite}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
            <ReferenceLine y={50} stroke={COLORS.reference} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {availableSignals.length <= 2 && (
        <p className="mt-2 text-center text-[10px] text-zinc-600">
          More data points will appear as FRED signals are collected over the coming days.
        </p>
      )}
    </ChartSection>
  );
}

/* ── Main Component ── */
export function HistoricalCharts() {
  const { data, error } = useSWR<HistoryResponse>("/api/history", fetcher, {
    refreshInterval: 300000,
  });

  if (error) {
    return (
      <div className="rounded-xl border border-border-pulse bg-surface-1 p-8 text-center">
        <p className="text-sm text-pulse-red">Failed to load historical data</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="text-lg font-semibold text-zinc-200">Historical Analysis</h2>
          <p className="mt-1 text-[12px] text-zinc-500">Loading chart data...</p>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-xl bg-surface-1" />
        ))}
      </div>
    );
  }

  const { sentimentHistory, signalHistory, marketActivity, attentionHistory, meta } = data;
  const hasSignals = Object.keys(signalHistory).length > 0;
  const hasSentiment = sentimentHistory.length > 1;
  const hasActivity = marketActivity.length > 1;

  // Visible category toggles
  const CATEGORIES = ["politics", "finance", "crypto", "tech", "culture", "geopolitics"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-zinc-200">Historical Analysis</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          Every 5 minutes, PULSE snapshots the state of societal sentiment. These charts track how
          beliefs, fears, and public attention evolve over time — revealing patterns that
          point-in-time readings miss.
        </p>
        <div
          className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-600"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          <span>{meta.snapshotCount} snapshots</span>
          <span>·</span>
          <span>{meta.pricePointCount.toLocaleString()} price points</span>
          <span>·</span>
          <span>{meta.signalReadingCount} signal readings</span>
          {meta.dataRange.from && (
            <>
              <span>·</span>
              <span>
                Since {new Date(meta.dataRange.from).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 1. Composite Sentiment Over Time */}
      <ChartSection
        title="Societal Sentiment Direction"
        subtitle="The composite sentiment score over time — positive means collective optimism, negative means pessimism. Category lines show which domains are driving the overall mood."
        color="var(--pulse-cyan)"
        empty={!hasSentiment}
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sentimentHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke={COLORS.text}
                tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
              />
              <YAxis
                stroke={COLORS.text}
                tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
                label={{
                  value: "Sentiment",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 9, fill: COLORS.text },
                }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-space-mono)" }} />
              <ReferenceLine y={0} stroke={COLORS.reference} strokeDasharray="4 4" />
              {/* Composite as a thick main line */}
              <Line
                type="monotone"
                dataKey="composite"
                name="Composite"
                stroke={COLORS.composite}
                strokeWidth={3}
                dot={{ r: 2 }}
              />
              {/* Category lines */}
              {CATEGORIES.map((cat) => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  name={CATEGORY_NAMES[cat]}
                  stroke={COLORS[cat as keyof typeof COLORS] ?? "#666"}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartSection>

      {/* 2. Market Activity Volume */}
      <ChartSection
        title="Market Activity Over Time"
        subtitle="How many price points were recorded each hour across all platforms — a proxy for how actively society is betting on the future."
        color="var(--pulse-green)"
        empty={!hasActivity}
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={marketActivity}>
              <defs>
                <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.finance} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.finance} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="hour"
                tickFormatter={formatTime}
                stroke={COLORS.text}
                tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
              />
              <YAxis
                stroke={COLORS.text}
                tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-space-mono)" }} />
              <Area
                type="monotone"
                dataKey="uniqueMarkets"
                name="Unique Markets"
                stroke={COLORS.finance}
                fill="url(#activityGrad)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="pricePoints"
                name="Price Points"
                stroke={COLORS.crypto}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartSection>

      {/* 3. Signal Layer Overlay */}
      {hasSignals && <SignalOverlayChart signalHistory={signalHistory} />}

      {/* 4. Attention Trends */}
      {attentionHistory.length > 1 && (
        <ChartSection
          title="Public Attention Over Time"
          subtitle="How public search interest evolves — high interest topics vs. blind spots where markets know something the public doesn't."
          color="var(--pulse-orange)"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attentionHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={formatTime}
                  stroke={COLORS.text}
                  tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
                />
                <YAxis
                  stroke={COLORS.text}
                  tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-space-mono)" }} />
                <Bar
                  dataKey="highInterest"
                  name="High Interest Topics"
                  fill={COLORS.culture}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="lowInterest"
                  name="Under the Radar"
                  fill={COLORS.geopolitics}
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="avgTrend"
                  name="Avg Trend Score"
                  stroke={COLORS.composite}
                  strokeWidth={2}
                  dot={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartSection>
      )}

      {/* Growing notice */}
      <div className="rounded-xl border border-dashed border-zinc-700 bg-surface-0 p-5 text-center">
        <p className="text-[12px] text-zinc-400">
          Charts get richer over time.
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          PULSE snapshots sentiment every 5 minutes and FRED data daily. After a week of collection,
          you&apos;ll see trends, cycles, and divergences that point-in-time readings can&apos;t capture.
        </p>
      </div>
    </div>
  );
}
