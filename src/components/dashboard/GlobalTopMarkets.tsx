"use client";

import useSWR from "swr";
import { PlatformBadge } from "./PlatformBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import type { NormalizedMarket } from "@/lib/platforms/types";

interface GroupedResponse {
  grouped: Record<string, NormalizedMarket[]>;
  totalMarkets: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function probabilityColor(p: number): string {
  if (p >= 0.6) return "text-emerald-400 bg-emerald-500/10";
  if (p <= 0.4) return "text-rose-400 bg-rose-500/10";
  return "text-zinc-400 bg-zinc-500/10";
}

export function GlobalTopMarkets() {
  const { data, isLoading } = useSWR<GroupedResponse>(
    "/api/markets",
    fetcher,
    { refreshInterval: 60000 },
  );

  const markets = data?.grouped
    ? Object.values(data.grouped)
        .flat()
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 10)
    : [];

  return (
    <div className="card p-5">
      <div className="flex items-center gap-1.5">
        <h2
          className="text-[10px] font-medium uppercase tracking-widest text-zinc-500"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Most-Watched Questions
        </h2>
        <InfoTip text="The 10 questions with the highest participation across all platforms. Ranked by dollar volume — how much real money (or play-money equivalent) people have put behind their beliefs. Click any question to view it on the source platform." />
      </div>
      {isLoading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-surface-2"
            />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No market data yet.
        </p>
      ) : (
        <div className="mt-3 space-y-0.5">
          {markets.map((m) => (
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
                  <span
                    className="text-[10px] text-zinc-600"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    ${(m.volume24h / 1000).toFixed(0)}k engaged
                  </span>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold ${probabilityColor(m.yesPrice)}`}
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {(m.yesPrice * 100).toFixed(0)}%
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
