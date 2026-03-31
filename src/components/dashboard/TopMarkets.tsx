"use client";

import { PlatformBadge } from "./PlatformBadge";
import type { MarketWithMomentum, NormalizedMarket } from "@/lib/platforms/types";

interface TopMarketsProps {
  markets: (MarketWithMomentum | NormalizedMarket)[];
}

function probabilityColor(p: number): string {
  if (p >= 0.6) return "text-emerald-400 bg-emerald-500/10";
  if (p <= 0.4) return "text-rose-400 bg-rose-500/10";
  return "text-zinc-400 bg-zinc-500/10";
}

function deltaText(market: MarketWithMomentum | NormalizedMarket): string | null {
  if (!("delta24h" in market) || market.delta24h === 0) return null;
  const delta = market.delta24h * 100;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`;
}

export function TopMarkets({ markets }: TopMarketsProps) {
  if (markets.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {markets.slice(0, 5).map((m) => {
        const delta = deltaText(m);
        return (
          <a
            key={m.id}
            href={m.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-zinc-300">
                {m.question}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <PlatformBadge platform={m.platform} />
                {m.volume24h > 0 && (
                  <span
                    className="text-[10px] text-zinc-600"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {m.volume24h >= 1000
                      ? `$${(m.volume24h / 1000).toFixed(0)}k engaged`
                      : `$${m.volume24h.toFixed(0)} engaged`}
                  </span>
                )}
                {delta && (
                  <span
                    className={`text-[10px] font-medium ${
                      delta.startsWith("+")
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {delta}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold ${probabilityColor(m.yesPrice)}`}
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {(m.yesPrice * 100).toFixed(0)}%
            </span>
          </a>
        );
      })}
    </div>
  );
}
