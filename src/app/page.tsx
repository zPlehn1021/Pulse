"use client";

import { useState } from "react";
import { useSentiment } from "@/hooks/useSentiment";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { SignalQuadrants } from "@/components/dashboard/SignalQuadrants";
import { AIBriefing } from "@/components/dashboard/AIBriefing";
import { CategoryCard } from "@/components/dashboard/CategoryCard";
import { DivergencePanel } from "@/components/dashboard/DivergencePanel";
import { GlobalTopMarkets } from "@/components/dashboard/GlobalTopMarkets";
import { SignalDeepDive } from "@/components/dashboard/SignalDeepDive";
import { TrackRecord } from "@/components/dashboard/TrackRecord";
import type { CategoryId } from "@/lib/platforms/types";

type Tab = "dashboard" | "signals" | "track-record" | "sources" | "business";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "signals", label: "Signal Deep-Dive" },
  { id: "track-record", label: "Track Record" },
  { id: "sources", label: "Sources" },
  { id: "business", label: "Business Model" },
];

export default function Home() {
  const {
    index,
    keyInsights,
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
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border-pulse">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors ${
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
            <div className="space-y-6">
              {/* Hero: AI Key Insights + Signal Tensions + Full Narrative */}
              <AIBriefing
                narrative={index?.narrative}
                keyInsights={keyInsights}
                tensions={index?.tensions ?? []}
              />

              {/* The 4 signal quadrants */}
              <SignalQuadrants signals={index?.signalLayers} />

              {/* Category cards + Top markets side-by-side */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
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

                  {/* Cross-community disagreements */}
                  <DivergencePanel divergences={index?.divergences ?? []} />
                </div>

                <div className="space-y-6">
                  <GlobalTopMarkets />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "signals" && <SignalDeepDive />}
      {activeTab === "track-record" && <TrackRecord />}
      {activeTab === "sources" && <SourcesPlaceholder />}
      {activeTab === "business" && <BusinessModelPlaceholder />}
    </div>
  );
}

/* -- Loading skeleton -- */
function LoadingSkeleton({ platformCount }: { platformCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
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

/* -- Placeholder pages -- */
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
        {["Polymarket", "Kalshi", "Manifold", "PredictIt", "Fear & Greed Index", "FRED (Federal Reserve)", "Google Trends (AI-Curated)"].map(
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
