"use client";

import useSWR from "swr";
import { InfoTip } from "@/components/ui/InfoTip";

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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CATEGORY_ICONS: Record<string, string> = {
  politics: "🏛️",
  finance: "📈",
  crypto: "₿",
  tech: "💻",
  culture: "🎭",
  geopolitics: "🌍",
};

function formatAge(ms: number | null): string {
  if (ms === null) return "never";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function trendDelta(current: number, previous: number | null): React.ReactNode {
  if (previous === null) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.001) return <span className="text-zinc-600">→</span>;
  const color = delta > 0 ? "text-pulse-green" : "text-pulse-red";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`text-[10px] ${color}`} style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
      {sign}{delta.toFixed(2)}
    </span>
  );
}

function SignalTable({
  title,
  signals,
  color,
  info,
}: {
  title: string;
  signals: SignalReading[];
  color: string;
  info: string;
}) {
  return (
    <div
      className="rounded-xl border border-border-pulse bg-surface-1 p-4"
      style={{ boxShadow: `0 0 20px ${color}08` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          {title}
        </h3>
        <InfoTip text={info} />
      </div>
      {signals.length === 0 ? (
        <p className="py-3 text-center text-xs text-zinc-600">No data yet</p>
      ) : (
        <div className="space-y-1.5">
          {signals.map((s) => (
            <div
              key={s.signalId}
              className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-zinc-300">{s.signalName}</p>
                <p
                  className="text-[9px] text-zinc-600"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {s.signalId} · {new Date(s.recordedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {trendDelta(s.value, s.previousValue)}
                <span
                  className="text-sm font-semibold text-zinc-200"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {s.value.toFixed(s.unit === "percent" ? 1 : 2)}
                </span>
                {s.unit && (
                  <span className="text-[9px] text-zinc-600">{s.unit}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SignalDeepDive() {
  const { data: signalsData } = useSWR<SignalsResponse>(
    "/api/signals",
    fetcher,
    { refreshInterval: 60000 },
  );

  const { data: attentionData } = useSWR<AttentionResponse>(
    "/api/attention",
    fetcher,
    { refreshInterval: 60000 },
  );

  const signals = signalsData?.readings ?? [];

  // Split signals by FRED layer (using known signal IDs)
  const EP_IDS = new Set(["UMCSENT", "CSCICP03USM665S", "MICH", "UNRATE", "ICSA", "RSAFS", "PSAVERT", "NFCI"]);
  const FEAR_IDS = new Set(["VIXCLS", "T10Y2Y", "BAMLH0A0HYM2", "PPIACO", "DTWEXBGS"]);
  const epSignals = signals.filter((s) => EP_IDS.has(s.signalId));
  const fearSignals = signals.filter((s) => FEAR_IDS.has(s.signalId));

  const terms = attentionData?.terms ?? [];
  const scores = attentionData?.scores;
  const meta = attentionData?.meta;

  return (
    <div className="space-y-6">
      {/* Overview row */}
      <div className="card p-4">
        <h2
          className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          Signal Deep-Dive
        </h2>
        <p className="text-xs text-zinc-500">
          Full readings from all signal layers. FRED economic data updates daily/weekly/monthly.
          Attention terms are AI-curated hourly.
        </p>
      </div>

      {/* Signal tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SignalTable
          title="Economic Psychology"
          signals={epSignals}
          color="var(--pulse-purple)"
          info="Consumer sentiment, unemployment, jobless claims, retail sales, savings rate, and financial conditions from FRED. These measure how ordinary people feel about the economy."
        />
        <SignalTable
          title="Fear Signals"
          signals={fearSignals}
          color="var(--pulse-amber)"
          info="VIX (volatility index), yield curve spread, high yield bond spreads, commodity prices, and dollar index from FRED. These measure acute anxiety in financial markets."
        />
      </div>

      {/* Attention layer */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3
              className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              AI-Curated Attention
            </h3>
            <InfoTip text="Claude generates 20 Google search terms every hour based on what prediction markets and economic data are showing. Google Trends scores reveal whether the public is paying attention to the same issues." />
          </div>
          {meta && (
            <div
              className="flex items-center gap-3 text-[10px] text-zinc-600"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              <span>{meta.totalTerms} terms</span>
              <span>{meta.fetchedTerms} fetched</span>
              <span>curated {formatAge(meta.lastCurationAge)}</span>
            </div>
          )}
        </div>

        {/* Category scores */}
        {scores && Object.keys(scores.byCategory).length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <span
              className="rounded-lg bg-pulse-orange/10 px-2.5 py-1 text-[10px] font-medium text-pulse-orange"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Overall: {scores.overall}
            </span>
            {Object.entries(scores.byCategory).map(([cat, score]) => (
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

        {/* Term grid */}
        {terms.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-600">
            No attention terms yet. They are generated hourly by AI.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {terms.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[11px] text-zinc-300"
                    title={t.reason ?? undefined}
                  >
                    {t.term}
                  </p>
                  <p className="text-[9px] text-zinc-600">
                    {CATEGORY_ICONS[t.category] ?? ""} {t.category}
                  </p>
                </div>
                <span
                  className="ml-2 shrink-0 text-sm font-semibold"
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    color: t.trendValue !== null && t.trendValue > 50
                      ? "var(--pulse-orange)"
                      : t.trendValue !== null && t.trendValue > 20
                      ? "var(--pulse-amber)"
                      : "var(--text-tertiary)",
                  }}
                >
                  {t.trendValue !== null ? t.trendValue : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
