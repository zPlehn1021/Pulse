"use client";

import { useState } from "react";
import { ArcGauge } from "@/components/charts/ArcGauge";
import { Sparkline } from "@/components/charts/Sparkline";
import { InfoTip } from "@/components/ui/InfoTip";
import type { CompositeIndex } from "@/lib/platforms/types";

interface CompositeGaugeProps {
  index: CompositeIndex | null;
  history: CompositeIndex[];
}

function sentimentLabel(m: number): string {
  if (m >= 50) return "Very Optimistic";
  if (m >= 20) return "Optimistic";
  if (m > 5) return "Leaning Optimistic";
  if (m >= -5) return "Neutral";
  if (m >= -20) return "Leaning Pessimistic";
  if (m >= -50) return "Pessimistic";
  return "Very Pessimistic";
}

function momentumColor(m: number): string {
  if (m >= 20) return "var(--pulse-green)";
  if (m > 5) return "var(--pulse-cyan)";
  if (m >= -5) return "var(--pulse-blue)";
  if (m >= -20) return "var(--pulse-amber)";
  return "var(--pulse-red)";
}

function cleanNarrative(text: string): string {
  return text
    .replace(/^#+\s+.*\n*/gm, "")
    .replace(/\*\*PULSE[^*]*\*\*\s*/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

export function CompositeGauge({ index, history }: CompositeGaugeProps) {
  const [showBrief, setShowBrief] = useState(false);
  const momentum = index?.momentum ?? 0;
  const volatility = index?.volatility ?? 0;
  const activity = index?.activity ?? 0;

  const momentumGaugeValue = (momentum + 100) / 2;
  const sparkData = history.map((h) => (h.momentum + 100) / 2).reverse();

  return (
    <div className="card p-6">
      {/* Three gauges */}
      <div className="flex items-center justify-around">
        <ArcGauge
          value={volatility}
          size={100}
          strokeWidth={8}
          color="var(--pulse-amber)"
          label="Uncertainty"
          info={
            <InfoTip text="How much people are changing their minds. Calculated from the standard deviation of confidence levels across all questions over the last 24 hours. High = beliefs in flux, Low = beliefs settled." />
          }
        />
        <div className="flex flex-col items-center">
          <ArcGauge
            value={momentumGaugeValue}
            size={160}
            strokeWidth={12}
            color={momentumColor(momentum)}
            label="Sentiment"
            sublabel={sentimentLabel(momentum)}
            info={
              <InfoTip text="The direction collective belief is shifting across all questions. Weighted by participation level and platform credibility. Ranges from -100 (very pessimistic) to +100 (very optimistic). Data from Polymarket, Kalshi, PredictIt, and Manifold." />
            }
          />
          <span
            className="mt-1 text-lg font-bold"
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              color: momentumColor(momentum),
            }}
          >
            {momentum > 0 ? "+" : ""}
            {momentum}
          </span>
        </div>
        <ArcGauge
          value={activity}
          size={100}
          strokeWidth={8}
          color="var(--pulse-cyan)"
          label="Engagement"
          sublabel={index ? `${index.totalMarkets.toLocaleString()} questions` : undefined}
          info={
            <InfoTip text="How actively people are weighing in across all platforms. Combines total participation volume and question count on a logarithmic scale. Higher means more people are expressing beliefs." />
          }
        />
      </div>

      {/* 24h sparkline */}
      {sparkData.length > 1 && (
        <div className="mt-5 flex items-center gap-3 border-t border-border-pulse pt-4">
          <div className="flex items-center gap-1">
            <span
              className="text-[10px] uppercase tracking-wider text-zinc-600"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              24h
            </span>
            <InfoTip text="Sentiment trend over the last 24 hours. Each point is a snapshot taken every 5 minutes. Shows how collective optimism/pessimism has shifted throughout the day." />
          </div>
          <Sparkline
            data={sparkData}
            width={280}
            height={32}
            color={momentumColor(momentum)}
          />
        </div>
      )}

      {/* AI briefing toggle */}
      {index?.narrative && (
        <div className="mt-4 border-t border-border-pulse pt-3">
          <button
            onClick={() => setShowBrief((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span
              className="text-[10px] font-medium uppercase tracking-widest text-zinc-500"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              AI Overview
            </span>
            <InfoTip text="AI-generated briefing analyzing what the collective believes right now. Written by Claude, updated every hour. Interprets sentiment shifts, belief patterns, and community disagreements." />
            <span className="text-[10px] text-zinc-600">
              {showBrief ? "▲" : "▼"}
            </span>
          </button>

          {showBrief && (
            <div className="mt-2.5 rounded-lg bg-surface-2 px-4 py-3">
              <p className="text-xs leading-relaxed text-zinc-300">
                {cleanNarrative(index.narrative)}
              </p>
              <p
                className="mt-1.5 text-[10px] text-zinc-600"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                AI briefing via Claude
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
