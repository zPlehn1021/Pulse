"use client";

import { ArcGauge } from "@/components/charts/ArcGauge";
import { Sparkline } from "@/components/charts/Sparkline";
import { InfoTip } from "@/components/ui/InfoTip";
import { getCategoryDef } from "@/lib/sentiment/categories";
import { TopMarkets } from "./TopMarkets";
import type { CategoryAnalysis, Platform } from "@/lib/platforms/types";

interface CategoryCardProps {
  category: CategoryAnalysis;
  sparkData?: number[];
  expanded?: boolean;
  onToggle?: () => void;
}

function cleanNarrative(text: string): string {
  return text
    .replace(/^#+\s+.*\n*/gm, "")
    .replace(/\*\*PULSE[^*]*\*\*\s*/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

const PLATFORM_SHORT: Partial<Record<Platform, string>> = {
  polymarket: "PM",
  kalshi: "KA",
  manifold: "MF",
  predictit: "PI",
  feargreed: "FG",
};

function momentumBadge(m: number): { text: string; color: string } {
  if (m >= 20) return { text: `+${m}`, color: "text-emerald-400 bg-emerald-500/10" };
  if (m > 5) return { text: `+${m}`, color: "text-cyan-400 bg-cyan-500/10" };
  if (m >= -5) return { text: `${m}`, color: "text-zinc-400 bg-zinc-500/10" };
  if (m >= -20) return { text: `${m}`, color: "text-amber-400 bg-amber-500/10" };
  return { text: `${m}`, color: "text-rose-400 bg-rose-500/10" };
}

export function CategoryCard({
  category,
  sparkData,
  expanded = false,
  onToggle,
}: CategoryCardProps) {
  const def = getCategoryDef(category.category);
  const badge = momentumBadge(category.momentum);

  // Active platforms with markets
  const activePlatforms = Object.entries(category.platformBreakdown)
    .filter(([, v]) => v.marketCount > 0)
    .sort((a, b) => b[1].marketCount - a[1].marketCount);

  return (
    <div
      className="card overflow-hidden transition-all duration-200"
      style={{
        boxShadow: `0 0 20px ${def.color}08, inset 0 1px 0 ${def.color}10`,
      }}
    >
      <button
        onClick={onToggle}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Category header */}
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
              <span>{def.icon}</span>
              <span>{def.label}</span>
              {/* Momentum badge */}
              <span
                className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${badge.color}`}
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {badge.text}
              </span>
              <span
                className="ml-auto text-[10px] text-zinc-600"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {expanded ? "▲" : "▼"}
              </span>
            </h3>

            {/* Market count + metrics */}
            <div
              className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              <span className="flex items-center gap-0.5">
                {category.marketCount} questions
                <InfoTip text="Number of prediction market questions tracked in this category, auto-categorized by keyword matching." />
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-0.5">
                uncertainty {category.volatility}
                <InfoTip text="How much beliefs are shifting in this category (0-100). Based on the standard deviation of confidence levels over time." />
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-0.5">
                engagement {category.activity}
                <InfoTip text="How actively people are weighing in on this category (0-100). Combines participation volume and question count." />
              </span>
            </div>

            {/* Platform breakdown pills */}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {activePlatforms.map(([platform, data]) => {
                const pBadge = momentumBadge(data.momentum);
                return (
                  <span
                    key={platform}
                    className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-zinc-400"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    <span className="text-zinc-500">
                      {PLATFORM_SHORT[platform as Platform] ?? platform}
                    </span>
                    <span className={data.momentum >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {data.momentum > 0 ? "+" : ""}{data.momentum}
                    </span>
                  </span>
                );
              })}
            </div>

            {/* AI narrative */}
            {category.narrative && (
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                {cleanNarrative(category.narrative)}
              </p>
            )}

            {/* Sparkline */}
            {sparkData && sparkData.length > 1 && (
              <div className="mt-2">
                <Sparkline
                  data={sparkData}
                  width={120}
                  height={20}
                  color={def.color}
                />
              </div>
            )}
          </div>

          {/* Momentum gauge (mapped from -100..100 to 0..100) */}
          <ArcGauge
            value={(category.momentum + 100) / 2}
            size={72}
            strokeWidth={6}
            color={def.color}
          />
        </div>
      </button>

      {/* Expanded: top markets */}
      {expanded && category.topMarkets.length > 0 && (
        <div className="border-t border-border-pulse px-4 pb-4 pt-3">
          <TopMarkets markets={category.topMarkets} />
        </div>
      )}
    </div>
  );
}
