"use client";

import { useState, useRef, useEffect } from "react";

interface InfoTipProps {
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<"bottom" | "top">("bottom");
  const tipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // If too close to bottom, show above
      if (rect.bottom + 120 > window.innerHeight) {
        setPosition("top");
      } else {
        setPosition("bottom");
      }
    }
  }, [open]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        ref={triggerRef}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-700 text-[8px] font-medium text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        i
      </span>

      {open && (
        <div
          ref={tipRef}
          className={`absolute z-50 w-56 rounded-lg border border-zinc-700/80 bg-surface-1 px-3 py-2.5 shadow-xl ${
            position === "bottom"
              ? "top-full mt-1.5 left-1/2 -translate-x-1/2"
              : "bottom-full mb-1.5 left-1/2 -translate-x-1/2"
          }`}
        >
          <p className="text-[11px] leading-relaxed text-zinc-300">{text}</p>
        </div>
      )}
    </span>
  );
}
