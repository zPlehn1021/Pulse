"use client";

import { useState } from "react";
import { useSentiment } from "@/hooks/useSentiment";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { CompositeGauge } from "@/components/dashboard/CompositeGauge";
import { CategoryCard } from "@/components/dashboard/CategoryCard";
import { DivergencePanel } from "@/components/dashboard/DivergencePanel";
import { GlobalTopMarkets } from "@/components/dashboard/GlobalTopMarkets";
import type { CategoryId } from "@/lib/platforms/types";

type Tab = "dashboard" | "sources" | "business";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sources", label: "Sources" },
  { id: "business", label: "Business Model" },
];

export default function Home() {
  const {
    index,
    history,
    totalMarkets,
    platformStatus,
    isLoading,
    isError,
    isStale,
  } = useSentiment();

  const { secondsSinceRefresh } = useAutoRefresh(index?.timestamp ?? null);

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [expandedCategory, setExpandedCategory] = useState<CategoryId | null>(
    null,
  );

  const platformCount = Object.values(platformStatus).filter(
    (p) => p.available,
  ).length || 5;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Tab navigation */}
      <nav className="mb-6 flex gap-1 border-b border-border-pulse">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-pulse-blue text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Error banner */}
      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-2.5 text-sm text-rose-400">
          <span>Failed to refresh data.</span>
          {isStale && (
            <span className="text-rose-500/70">
              Showing data from {secondsSinceRefresh}s ago.
            </span>
          )}
        </div>
      )}

      {activeTab === "dashboard" && (
        <>
          {isLoading ? (
            <LoadingSkeleton platformCount={platformCount} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left column: composite + categories */}
              <div className="space-y-6 lg:col-span-2">
                <CompositeGauge index={index} history={history} />

                {/* Divergences (inline, above categories) */}
                <DivergencePanel divergences={index?.divergences ?? []} />

                {/* Category grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {index?.categories.map((cat) => (
                    <CategoryCard
                      key={cat.category}
                      category={cat}
                      expanded={expandedCategory === cat.category}
                      onToggle={() =>
                        setExpandedCategory(
                          expandedCategory === cat.category
                            ? null
                            : cat.category,
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Right column: top markets */}
              <div className="space-y-6">
                <GlobalTopMarkets />
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "sources" && <SourcesPlaceholder />}
      {activeTab === "business" && <BusinessModelPlaceholder />}
    </div>
  );
}

/* ── Loading skeleton ── */
function LoadingSkeleton({ platformCount }: { platformCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      {/* Spinner */}
      <div className="relative h-12 w-12">
        <div
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
          style={{
            borderTopColor: "var(--pulse-blue)",
            borderRightColor: "var(--pulse-cyan)",
          }}
        />
      </div>
      <p
        className="mt-4 text-sm text-zinc-500"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        Aggregating from {platformCount} platforms...
      </p>
    </div>
  );
}

/* ── Placeholder pages ── */
function SourcesPlaceholder() {
  return (
    <div className="card p-8 text-center">
      <h2
        className="text-lg font-medium text-zinc-300"
        style={{ fontFamily: "var(--font-space-mono)" }}
      >
        Data Sources
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        Detailed platform status, health metrics, and individual market feeds.
      </p>
      <div className="mx-auto mt-6 grid max-w-md gap-3">
        {["Polymarket", "Kalshi", "Manifold", "PredictIt", "Fear & Greed Index"].map(
          (name) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3"
            >
              <span className="text-sm text-zinc-300">{name}</span>
              <span
                className="text-xs text-zinc-600"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Coming soon
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function BusinessModelPlaceholder() {
  return (
    <div className="card p-8 text-center">
      <h2
        className="text-lg font-medium text-zinc-300"
        style={{ fontFamily: "var(--font-space-mono)" }}
      >
        Business Model
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        Monetization strategy, tier comparison, and growth roadmap.
      </p>
      <div className="mx-auto mt-6 grid max-w-lg gap-3 sm:grid-cols-3">
        {[
          { tier: "Free", price: "$0", desc: "5-min delayed data" },
          { tier: "Pro", price: "$29/mo", desc: "Real-time + alerts" },
          { tier: "Enterprise", price: "Custom", desc: "API + white-label" },
        ].map((plan) => (
          <div
            key={plan.tier}
            className="rounded-lg border border-border-pulse bg-surface-2 p-4"
          >
            <p className="text-sm font-medium text-zinc-200">{plan.tier}</p>
            <p
              className="mt-1 text-lg font-bold text-white"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {plan.price}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{plan.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
