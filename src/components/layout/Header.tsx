"use client";

import { useSentiment } from "@/hooks/useSentiment";

function LayerDot({ active, color, label }: { active: boolean; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: active ? color : "var(--text-tertiary)" }}
      />
      <span className="text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
    </div>
  );
}

export function Header() {
  const { index, totalMarkets, platformStatus } = useSentiment();

  const platformCount = Object.values(platformStatus).filter(
    (p) => p.available,
  ).length;

  const lastUpdated = index
    ? new Date(index.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  // Stale if no data or last update > 5 minutes ago
  const isStale =
    !index ||
    Date.now() - new Date(index.timestamp).getTime() > 5 * 60 * 1000;

  const signals = index?.signalLayers;
  const hasMarkets = totalMarkets > 0;
  const hasEconomy = signals?.economicPsychology?.consumerSentiment != null;
  const hasFear = signals?.fearSignals?.vix != null;
  const hasAttention = (signals?.attention?.topTerms?.length ?? 0) > 0;

  return (
    <header className="border-b border-border-pulse bg-surface-1/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Left: Wordmark + subtitle */}
        <div className="flex items-center gap-3">
          <span
            className="text-xl tracking-tight text-white"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            <span className="font-bold">PULSE</span>
          </span>

          <span
            className="hidden text-[10px] tracking-wide text-zinc-500 sm:inline"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            Unified Societal Sentiment Engine
          </span>
        </div>

        {/* Right: Signal layers + status */}
        <div className="flex items-center gap-4">
          {/* Signal layer indicators */}
          <div
            className="hidden items-center gap-3 sm:flex"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            <LayerDot active={hasMarkets} color="var(--pulse-blue)" label="Markets" />
            <LayerDot active={hasEconomy} color="var(--pulse-purple)" label="Economy" />
            <LayerDot active={hasFear} color="var(--pulse-amber)" label="Fear" />
            <LayerDot active={hasAttention} color="var(--pulse-orange)" label="Attention" />
          </div>

          {/* Compact stats */}
          {totalMarkets > 0 && (
            <span
              className="hidden text-[10px] text-zinc-600 lg:inline"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {platformCount} sources &middot; {totalMarkets.toLocaleString()} questions
            </span>
          )}

          {/* Last updated */}
          {lastUpdated && (
            <span
              className="text-xs text-zinc-500"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {lastUpdated}
            </span>
          )}

          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  isStale ? "bg-amber-400" : "bg-emerald-400"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  isStale ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {isStale ? "Stale" : "Live"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
