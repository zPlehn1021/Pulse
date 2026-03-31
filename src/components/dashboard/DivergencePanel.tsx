"use client";

import { PlatformBadge } from "./PlatformBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import type { Divergence } from "@/lib/platforms/types";

interface DivergencePanelProps {
  divergences: Divergence[];
}

export function DivergencePanel({ divergences = [] }: DivergencePanelProps) {
  // Only show divergences with meaningful spread
  const filtered = divergences.filter((d) => d.spread > 5).slice(0, 5);

  if (filtered.length === 0) return null;

  return (
    <div
      className="card overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(249, 115, 22, 0.06) 0%, rgba(245, 158, 11, 0.03) 100%)",
        borderColor: "rgba(249, 115, 22, 0.15)",
      }}
    >
      <div className="px-5 pt-5 pb-1">
        <div className="flex items-center gap-1.5">
          <h2
            className="text-[10px] font-medium uppercase tracking-widest text-amber-500/80"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Where Communities Disagree
          </h2>
          <InfoTip text="Questions asked on multiple platforms where communities gave very different answers. Found by matching question text across platforms (Jaccard similarity > 35%) and flagging confidence gaps > 5 percentage points. Reveals how different groups see the same event." />
        </div>
        <p className="mt-0.5 text-[10px] text-amber-500/50">
          Same question, different beliefs across platforms
        </p>
      </div>

      <div className="divide-y divide-amber-500/10 px-5 pb-4">
        {filtered.map((d, i) => (
          <div key={i} className="py-3">
            {/* Question text */}
            <p className="truncate text-xs text-zinc-300">
              {d.question}
            </p>

            <div className="mt-2 flex items-center gap-2">
              {/* High platform */}
              <div className="flex items-center gap-1.5">
                <PlatformBadge platform={d.highPlatform} />
                <span
                  className="text-xs font-medium text-emerald-400"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {d.highPrice}%
                </span>
              </div>

              {/* Spread indicator */}
              <div className="flex items-center gap-1">
                <span className="text-zinc-600">↔</span>
                <span
                  className="text-xs font-bold text-amber-400"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {d.spread}pp
                </span>
              </div>

              {/* Low platform */}
              <div className="flex items-center gap-1.5">
                <PlatformBadge platform={d.lowPlatform} />
                <span
                  className="text-xs font-medium text-rose-400"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {d.lowPrice}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
