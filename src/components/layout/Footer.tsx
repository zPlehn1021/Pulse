export function Footer() {
  return (
    <footer className="border-t border-border-pulse bg-surface-1/60">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Left: Data sources */}
        <span className="text-[11px] text-zinc-600">
          Data from Polymarket &middot; Kalshi &middot; Manifold &middot;
          PredictIt &middot; Fear &amp; Greed Index
        </span>

        {/* Center: Branding */}
        <span
          className="hidden text-[11px] text-zinc-500 sm:inline"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          PlehnAutomation
        </span>

        {/* Right: Tier badge */}
        <span className="inline-flex items-center gap-1 rounded border border-border-light bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Free Tier
        </span>
      </div>
    </footer>
  );
}
