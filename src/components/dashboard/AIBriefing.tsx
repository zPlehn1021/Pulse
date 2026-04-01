"use client";

import { useState } from "react";
import { InfoTip } from "@/components/ui/InfoTip";
import type { KeyInsight } from "@/hooks/useSentiment";
import type { SignalTension } from "@/lib/platforms/types";

interface AIBriefingProps {
  narrative: string | null | undefined;
  keyInsights: KeyInsight[];
  tensions: SignalTension[];
}

function cleanNarrative(text: string): string {
  return text
    .replace(/^#+\s+.*\n*/gm, "")
    .replace(/\*\*PULSE[^*]*\*\*\s*/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

const SENTIMENT_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  positive: { bg: "rgba(42,157,143,0.06)", border: "rgba(42,157,143,0.15)", dot: "var(--pulse-green)" },
  negative: { bg: "rgba(230,57,70,0.06)", border: "rgba(230,57,70,0.15)", dot: "var(--pulse-red)" },
  mixed: { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)", dot: "var(--pulse-amber)" },
  neutral: { bg: "rgba(139,162,255,0.06)", border: "rgba(139,162,255,0.15)", dot: "var(--pulse-cyan)" },
};

const LAYER_ICONS: Record<string, string> = {
  markets: "📊",
  economy: "🏠",
  fear: "⚡",
  attention: "🔍",
};

const SEVERITY_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  high: { border: "rgba(230,57,70,0.2)", bg: "rgba(230,57,70,0.05)", text: "var(--pulse-red)" },
  medium: { border: "rgba(245,158,11,0.2)", bg: "rgba(245,158,11,0.05)", text: "var(--pulse-amber)" },
  low: { border: "rgba(103,232,249,0.2)", bg: "rgba(103,232,249,0.05)", text: "var(--pulse-cyan)" },
};

const LAYER_LABELS: Record<string, string> = {
  predictionMarkets: "Markets",
  economicPsychology: "Economy",
  fearSignals: "Fear",
  attention: "Attention",
};

export function AIBriefing({ narrative, keyInsights, tensions }: AIBriefingProps) {
  const [showNarrative, setShowNarrative] = useState(false);
  const hasInsights = keyInsights.length > 0;
  const hasTensions = tensions.length > 0;

  if (!narrative && !hasInsights && !hasTensions) return null;

  return (
    <div className="space-y-4">
      {/* Key Insights — the hero section */}
      {hasInsights && (
        <div className="rounded-xl border border-border-pulse bg-surface-1 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: "var(--pulse-cyan)" }} />
            <h2
              className="text-xs font-semibold uppercase tracking-wider text-zinc-200"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Key Insights
            </h2>
            <InfoTip text="AI-generated analysis connecting signals across all four layers — prediction markets, economic psychology, fear indicators, and public attention. These surface what matters most right now and what the data means together. Updated hourly." />
            <span
              className="ml-auto text-[10px] text-zinc-600"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Multi-signal analysis via Claude
            </span>
          </div>

          <div className="space-y-3">
            {keyInsights.map((insight, i) => {
              const colors = SENTIMENT_COLORS[insight.sentiment] ?? SENTIMENT_COLORS.neutral;
              return (
                <div
                  key={i}
                  className="rounded-lg border p-4"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colors.dot }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3
                        className="text-sm font-medium leading-snug text-zinc-200"
                        style={{ fontFamily: "var(--font-inter)" }}
                      >
                        {insight.headline}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                        {insight.detail}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {insight.layers.map((layer) => (
                          <span
                            key={layer}
                            className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-zinc-500"
                            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                          >
                            {LAYER_ICONS[layer] ?? ""} {layer}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signal Tensions */}
      {hasTensions && (
        <div className="rounded-xl border border-border-pulse bg-surface-1 p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2
              className="text-xs font-semibold uppercase tracking-wider text-zinc-200"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Signal Tensions
            </h2>
            <InfoTip text="Cross-layer disagreements — when prediction markets, consumer sentiment, fear indicators, and public attention tell different stories. These often signal that something important is unfolding beneath the surface." />
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-medium"
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                backgroundColor: "rgba(245,158,11,0.1)",
                color: "var(--pulse-amber)",
              }}
            >
              {tensions.length} {tensions.length === 1 ? "tension" : "tensions"}
            </span>
          </div>

          <div className="space-y-2">
            {tensions.map((t, i) => {
              const style = SEVERITY_STYLE[t.severity] ?? SEVERITY_STYLE.low;
              return (
                <div
                  key={i}
                  className="rounded-lg border p-3"
                  style={{ borderColor: style.border, backgroundColor: style.bg }}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                      style={{
                        fontFamily: "var(--font-jetbrains-mono)",
                        color: style.text,
                        backgroundColor: `${style.border}`,
                      }}
                    >
                      {t.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-relaxed text-zinc-300">
                        {t.description}
                      </p>
                      {t.implication && (
                        <p className="mt-1 text-[10px] italic text-zinc-500">
                          → {t.implication}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {t.layers.map((layer) => (
                          <span
                            key={layer}
                            className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-zinc-500"
                            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                          >
                            {LAYER_LABELS[layer] ?? layer}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full narrative — collapsible, secondary */}
      {narrative && (
        <div className="rounded-xl border border-border-pulse bg-surface-1 p-4">
          <button
            onClick={() => setShowNarrative((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <h2
              className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Full AI Narrative
            </h2>
            <span className="text-[10px] text-zinc-600">
              {showNarrative ? "▲" : "▼"}
            </span>
          </button>

          {showNarrative && (
            <div className="mt-3 rounded-lg bg-surface-2 px-4 py-3">
              <p className="text-xs leading-relaxed text-zinc-300">
                {cleanNarrative(narrative)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
