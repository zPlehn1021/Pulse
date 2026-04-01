"use client";

import useSWR from "swr";
import { InfoTip } from "@/components/ui/InfoTip";

interface TrackRecordData {
  status: "building" | "active";
  message?: string;
  totalResolutions?: number;
  predictionMarketAccuracy?: number;
  signalConcordanceRate?: number;
  byCategory?: Record<string, { total: number; correct: number; accuracy: number }>;
  timestamp: string;
}

interface Resolution {
  id: number;
  description: string;
  category: string;
  outcome: string;
  resolvedAt: string;
  predictionCorrect: boolean;
  confidenceAtClose: number | null;
  consumerSentimentDirection: string | null;
  fearSignalsDirection: string | null;
  attentionLevel: string | null;
  retrospective: string | null;
}

interface ResolutionsResponse {
  resolutions: Resolution[];
  meta: { count: number };
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

function StatCard({
  label,
  value,
  suffix,
  color,
  info,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  color: string;
  info: string;
}) {
  return (
    <div className="rounded-xl border border-border-pulse bg-surface-1 p-4 text-center">
      <div className="flex items-center justify-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
        <InfoTip text={info} />
      </div>
      <p
        className="mt-1 text-2xl font-bold"
        style={{ fontFamily: "var(--font-jetbrains-mono)", color }}
      >
        {value}
        {suffix && <span className="text-sm text-zinc-500">{suffix}</span>}
      </p>
    </div>
  );
}

export function TrackRecord() {
  const { data: trackData } = useSWR<TrackRecordData>(
    "/api/track-record",
    fetcher,
    { refreshInterval: 60000 },
  );

  const { data: resData } = useSWR<ResolutionsResponse>(
    "/api/resolutions?limit=20",
    fetcher,
    { refreshInterval: 60000 },
  );

  // Building state — no resolutions yet
  if (!trackData || trackData.status === "building") {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
          <span className="text-2xl">📊</span>
        </div>
        <h2
          className="text-lg font-medium text-zinc-300"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          Building Track Record
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          PULSE is tracking predictions across {" "}
          <span className="text-zinc-300">4 signal layers</span> and waiting for
          markets to resolve. As outcomes are confirmed, accuracy statistics and
          AI retrospectives will appear here.
        </p>
        <div className="mx-auto mt-6 max-w-xs">
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-pulse-blue/50"
              style={{ width: "5%", transition: "width 1s ease" }}
            />
          </div>
          <p
            className="mt-2 text-[10px] text-zinc-600"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {trackData?.totalResolutions ?? 0} resolutions so far — this grows over time
          </p>
        </div>
      </div>
    );
  }

  // Active state — we have data
  const resolutions = resData?.resolutions ?? [];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Resolutions"
          value={trackData.totalResolutions ?? 0}
          color="var(--pulse-cyan)"
          info="Total number of prediction markets that have resolved with a confirmed outcome."
        />
        <StatCard
          label="Market Accuracy"
          value={trackData.predictionMarketAccuracy ?? 0}
          suffix="%"
          color="var(--pulse-green)"
          info="How often the prediction market's majority opinion (>50% confidence) matched the actual outcome."
        />
        <StatCard
          label="Signal Concordance"
          value={trackData.signalConcordanceRate ?? 0}
          suffix="%"
          color="var(--pulse-purple)"
          info="How often all available signal layers (markets, consumer sentiment, fear indicators) agreed with each other before the outcome was known."
        />
      </div>

      {/* Per-category breakdown */}
      {trackData.byCategory && Object.keys(trackData.byCategory).length > 0 && (
        <div className="card p-4">
          <h3
            className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            Accuracy by Category
          </h3>
          <div className="space-y-2">
            {Object.entries(trackData.byCategory).map(([cat, stats]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="w-5 text-center">{CATEGORY_ICONS[cat] ?? "·"}</span>
                <span className="w-24 text-xs capitalize text-zinc-400">{cat}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${stats.accuracy}%`,
                      backgroundColor: stats.accuracy >= 70 ? "var(--pulse-green)" : stats.accuracy >= 50 ? "var(--pulse-amber)" : "var(--pulse-red)",
                    }}
                  />
                </div>
                <span
                  className="w-16 text-right text-[10px] text-zinc-400"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {stats.correct}/{stats.total} ({stats.accuracy}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent resolutions */}
      <div className="card p-4">
        <h3
          className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          Recent Resolutions
        </h3>
        {resolutions.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-600">
            No resolutions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {resolutions.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border-pulse bg-surface-2 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] leading-relaxed text-zinc-300">
                      {r.description}
                    </p>
                    <div
                      className="mt-1 flex flex-wrap items-center gap-2 text-[10px]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      <span className="text-zinc-500">{CATEGORY_ICONS[r.category] ?? ""} {r.category}</span>
                      <span className={r.outcome === "yes" ? "text-pulse-green" : "text-pulse-red"}>
                        {r.outcome.toUpperCase()}
                      </span>
                      {r.confidenceAtClose !== null && (
                        <span className="text-zinc-500">
                          at {Math.round(r.confidenceAtClose * 100)}% conf
                        </span>
                      )}
                      <span className={r.predictionCorrect ? "text-pulse-green" : "text-pulse-red"}>
                        {r.predictionCorrect ? "✓ Correct" : "✗ Wrong"}
                      </span>
                    </div>
                    {/* Signal alignment */}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.consumerSentimentDirection && (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] ${
                          r.consumerSentimentDirection === "aligned"
                            ? "bg-pulse-green/10 text-pulse-green"
                            : r.consumerSentimentDirection === "misaligned"
                            ? "bg-pulse-red/10 text-pulse-red"
                            : "bg-surface-3 text-zinc-500"
                        }`}>
                          Sentiment: {r.consumerSentimentDirection}
                        </span>
                      )}
                      {r.fearSignalsDirection && (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] ${
                          r.fearSignalsDirection === "aligned"
                            ? "bg-pulse-green/10 text-pulse-green"
                            : r.fearSignalsDirection === "misaligned"
                            ? "bg-pulse-red/10 text-pulse-red"
                            : "bg-surface-3 text-zinc-500"
                        }`}>
                          Fear: {r.fearSignalsDirection}
                        </span>
                      )}
                      {r.attentionLevel && (
                        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-zinc-500">
                          Attention: {r.attentionLevel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {r.retrospective && (
                  <p className="mt-2 border-t border-border-pulse pt-2 text-[10px] italic leading-relaxed text-zinc-500">
                    {r.retrospective}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
