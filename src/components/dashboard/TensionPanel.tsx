"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import type { SignalTension } from "@/lib/platforms/types";

interface TensionPanelProps {
  tensions: SignalTension[];
}

const SEVERITY_STYLE: Record<string, { border: string; bg: string; badge: string; badgeBg: string }> = {
  high: {
    border: "border-pulse-red/20",
    bg: "bg-pulse-red/5",
    badge: "text-pulse-red",
    badgeBg: "bg-pulse-red/10",
  },
  medium: {
    border: "border-pulse-amber/20",
    bg: "bg-pulse-amber/5",
    badge: "text-pulse-amber",
    badgeBg: "bg-pulse-amber/10",
  },
  low: {
    border: "border-pulse-cyan/20",
    bg: "bg-pulse-cyan/5",
    badge: "text-pulse-cyan",
    badgeBg: "bg-pulse-cyan/10",
  },
};

const LAYER_LABELS: Record<string, string> = {
  predictionMarkets: "Markets",
  economicPsychology: "Economy",
  fearSignals: "Fear",
  attention: "Attention",
};

export function TensionPanel({ tensions }: TensionPanelProps) {
  if (tensions.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2
          className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          Signal Tensions
        </h2>
        <InfoTip text="Cross-layer disagreements — when prediction markets, consumer sentiment, fear indicators, and public attention tell different stories. Tensions often signal that something important is unfolding." />
        <span
          className="rounded-full bg-pulse-amber/10 px-2 py-0.5 text-[9px] font-medium text-pulse-amber"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          {tensions.length}
        </span>
      </div>

      <div className="space-y-2">
        {tensions.map((t, i) => {
          const style = SEVERITY_STYLE[t.severity] ?? SEVERITY_STYLE.low;
          return (
            <div
              key={i}
              className={`rounded-lg border ${style.border} ${style.bg} p-3`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${style.badge} ${style.badgeBg}`}
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {t.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] leading-relaxed text-zinc-300">
                    {t.description}
                  </p>
                  {t.implication && (
                    <p className="mt-1 text-[10px] italic text-zinc-500">
                      {t.implication}
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
                    {t.category !== "cross-category" && (
                      <span
                        className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-zinc-500"
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        {t.category}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
