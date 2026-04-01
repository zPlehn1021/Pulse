"use client";

import { useState } from "react";
import { InfoTip } from "@/components/ui/InfoTip";

interface AIBriefingProps {
  narrative: string | null | undefined;
}

function cleanNarrative(text: string): string {
  return text
    .replace(/^#+\s+.*\n*/gm, "")
    .replace(/\*\*PULSE[^*]*\*\*\s*/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

export function AIBriefing({ narrative }: AIBriefingProps) {
  const [expanded, setExpanded] = useState(true);

  if (!narrative) return null;

  return (
    <div className="card p-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <h2
          className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          AI Briefing
        </h2>
        <InfoTip text="Claude-generated analysis of what the collective believes right now. Interprets sentiment shifts across all 4 signal layers — prediction markets, economic psychology, fear indicators, and public attention. Updated hourly." />
        <span className="text-[10px] text-zinc-600">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 rounded-lg bg-surface-2 px-4 py-3">
          <p className="text-xs leading-relaxed text-zinc-300">
            {cleanNarrative(narrative)}
          </p>
          <p
            className="mt-2 text-[10px] text-zinc-600"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Multi-signal analysis via Claude
          </p>
        </div>
      )}
    </div>
  );
}
