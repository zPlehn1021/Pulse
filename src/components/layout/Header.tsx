"use client";

import { useSentiment } from "@/hooks/useSentiment";

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

  return (
    <header className="border-b border-border-pulse bg-surface-1/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Left: Wordmark + badge */}
        <div className="flex items-center gap-3">
          <span
            className="text-xl tracking-tight text-white"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            <span className="font-bold">PULSE</span>
          </span>

          <span className="hidden items-center gap-1.5 rounded-full border border-border-light bg-surface-2 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400 sm:inline-flex">
            v2 Multi-Source
          </span>
        </div>

        {/* Right: Status indicators */}
        <div className="flex items-center gap-4">
          {/* Platform / market count */}
          {totalMarkets > 0 && (
            <span
              className="hidden text-xs text-zinc-500 sm:inline"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {platformCount} sources &middot;{" "}
              {totalMarkets.toLocaleString()} questions
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
