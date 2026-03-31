import type { Platform } from "@/lib/platforms/types";

const PLATFORM_STYLES: Record<Platform, { bg: string; text: string }> = {
  polymarket: { bg: "bg-indigo-500/15", text: "text-indigo-400" },
  kalshi: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  manifold: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  predictit: { bg: "bg-rose-500/15", text: "text-rose-400" },
  feargreed: { bg: "bg-amber-500/15", text: "text-amber-400" },
};

interface PlatformBadgeProps {
  platform: Platform;
}

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  const style = PLATFORM_STYLES[platform] ?? {
    bg: "bg-zinc-500/15",
    text: "text-zinc-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}
      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
    >
      {platform}
    </span>
  );
}
