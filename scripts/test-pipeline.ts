/**
 * PULSE Pipeline Test Script
 *
 * Tests the full data pipeline: platform fetching → sentiment computation → SQLite storage.
 * Run with: npm run test:pipeline
 */

import { polymarket } from "../src/lib/platforms/polymarket";
import { kalshi } from "../src/lib/platforms/kalshi";
import { manifold } from "../src/lib/platforms/manifold";
import { predictit } from "../src/lib/platforms/predictit";
import { feargreed } from "../src/lib/platforms/feargreed";
import { computeCompositeIndex } from "../src/lib/sentiment/compute";
import { saveSnapshot, getLatestSnapshot, getHistory } from "../src/lib/db/client";
import type { NormalizedMarket, PlatformAdapter } from "../src/lib/platforms/types";

const DIVIDER = "─".repeat(60);

function log(label: string, value: unknown) {
  console.log(`  ${label}: ${typeof value === "object" ? JSON.stringify(value, null, 4) : value}`);
}

// ── Step 1: Platform Adapters ────────────────────────────────────────────────

async function testAdapters(): Promise<NormalizedMarket[]> {
  console.log("\n" + DIVIDER);
  console.log("STEP 1: Testing Platform Adapters");
  console.log(DIVIDER);

  const adapters: PlatformAdapter[] = [polymarket, kalshi, manifold, predictit, feargreed];
  const allMarkets: NormalizedMarket[] = [];

  for (const adapter of adapters) {
    console.log(`\n▸ ${adapter.platform.toUpperCase()}`);

    try {
      const start = Date.now();
      const markets = await adapter.fetchMarkets();
      const elapsed = Date.now() - start;

      log("Markets fetched", markets.length);
      log("Fetch time", `${elapsed}ms`);

      if (markets.length > 0) {
        const sample = markets[0];
        console.log("  Sample market:");
        log("  id", sample.id);
        log("  question", sample.question);
        log("  category", sample.category);
        log("  yesPrice", sample.yesPrice);
        log("  volume24h", sample.volume24h);
        log("  sourceUrl", sample.sourceUrl);

        // Category distribution
        const cats: Record<string, number> = {};
        for (const m of markets) {
          cats[m.category] = (cats[m.category] || 0) + 1;
        }
        log("Category distribution", cats);
      }

      allMarkets.push(...markets);
    } catch (err) {
      console.log(`  ✗ ERROR: ${err}`);
    }
  }

  console.log(`\n  Total markets across all platforms: ${allMarkets.length}`);
  return allMarkets;
}

// ── Step 2: Sentiment Computation ────────────────────────────────────────────

function testComputation(markets: NormalizedMarket[]) {
  console.log("\n" + DIVIDER);
  console.log("STEP 2: Testing Sentiment Computation");
  console.log(DIVIDER);

  const start = Date.now();
  const index = computeCompositeIndex(markets);
  const elapsed = Date.now() - start;

  console.log(`\n  Computation time: ${elapsed}ms`);
  console.log(`\n▸ COMPOSITE INDEX`);
  log("Momentum", index.momentum);
  log("Volatility", index.volatility);
  log("Activity", index.activity);
  log("Total markets", index.totalMarkets);

  console.log(`\n▸ CATEGORY BREAKDOWN`);
  for (const cat of index.categories) {
    console.log(`\n  ${cat.category.toUpperCase()}`);
    log("Momentum", cat.momentum);
    log("Volatility", cat.volatility);
    log("Activity", cat.activity);
    log("Market count", cat.marketCount);

    // Platform breakdown
    const active = Object.entries(cat.platformBreakdown)
      .filter(([, v]) => v.marketCount > 0)
      .map(([p, v]) => `${p}: mom=${v.momentum} (${v.marketCount} mkts)`)
      .join(", ");
    log("Platforms", active || "none");

    // Top markets
    if (cat.topMarkets.length > 0) {
      console.log("  Top markets:");
      for (const m of cat.topMarkets.slice(0, 3)) {
        const delta = m.delta24h !== 0 ? ` (${m.delta24h > 0 ? "+" : ""}${(m.delta24h * 100).toFixed(1)}pp)` : "";
        console.log(`    • [${(m.yesPrice * 100).toFixed(0)}%${delta}] ${m.question.slice(0, 60)}`);
      }
    }
  }

  console.log(`\n▸ DIVERGENCES (${index.divergences.length} found)`);
  if (index.divergences.length === 0) {
    console.log("  No significant cross-platform divergences.");
  } else {
    for (const d of index.divergences.slice(0, 10)) {
      console.log(
        `  ${d.category}: ${d.spread}pp spread ` +
          `(${d.highPlatform} ${d.highPrice}% vs ${d.lowPlatform} ${d.lowPrice}%) — "${d.question.slice(0, 50)}"`,
      );
    }
  }

  return index;
}

// ── Step 3: SQLite Storage ───────────────────────────────────────────────────

function testStorage(index: ReturnType<typeof computeCompositeIndex>) {
  console.log("\n" + DIVIDER);
  console.log("STEP 3: Testing SQLite Storage");
  console.log(DIVIDER);

  // Save
  console.log("\n▸ SAVE SNAPSHOT");
  const snapshotId = saveSnapshot(index);
  log("Snapshot ID", snapshotId);
  console.log("  ✓ Snapshot saved successfully");

  // Retrieve latest
  console.log("\n▸ RETRIEVE LATEST SNAPSHOT");
  const latest = getLatestSnapshot();
  if (!latest) {
    console.log("  ✗ ERROR: No snapshot found after saving!");
    return;
  }

  log("Momentum", latest.momentum);
  log("Volatility", latest.volatility);
  log("Activity", latest.activity);
  log("Total markets", latest.totalMarkets);
  log("Categories", latest.categories.length);
  log("Divergences", latest.divergences.length);

  // Verify
  console.log("\n▸ VERIFY DATA INTEGRITY");
  const checks = [
    ["momentum", index.momentum, latest.momentum],
    ["volatility", index.volatility, latest.volatility],
    ["activity", index.activity, latest.activity],
    ["totalMarkets", index.totalMarkets, latest.totalMarkets],
    ["categories count", index.categories.length, latest.categories.length],
    ["divergences count", index.divergences.length, latest.divergences.length],
  ] as const;

  let allPassed = true;
  for (const [name, expected, actual] of checks) {
    const pass = expected === actual;
    console.log(`  ${pass ? "✓" : "✗"} ${name}: ${actual} ${pass ? "" : `(expected ${expected})`}`);
    if (!pass) allPassed = false;
  }

  // Verify category momentum values match
  for (const origCat of index.categories) {
    const savedCat = latest.categories.find((c) => c.category === origCat.category);
    if (!savedCat) {
      console.log(`  ✗ Missing category: ${origCat.category}`);
      allPassed = false;
      continue;
    }
    const momMatch = origCat.momentum === savedCat.momentum;
    if (!momMatch) {
      console.log(
        `  ✗ ${origCat.category} momentum: ${savedCat.momentum} (expected ${origCat.momentum})`,
      );
      allPassed = false;
    }
  }

  // Test history retrieval
  console.log("\n▸ HISTORY RETRIEVAL");
  const history = getHistory(24);
  log("Snapshots in last 24h", history.length);
  console.log(`  ✓ History retrieval working`);

  console.log(
    `\n  ${allPassed ? "✓ ALL CHECKS PASSED" : "✗ SOME CHECKS FAILED"}`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           PULSE Pipeline Integration Test               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const markets = await testAdapters();

  if (markets.length === 0) {
    console.log("\n✗ No markets fetched — cannot continue pipeline test.");
    process.exit(1);
  }

  const index = testComputation(markets);
  testStorage(index);

  console.log("\n" + DIVIDER);
  console.log("Pipeline test complete.");
  console.log(DIVIDER + "\n");
}

main().catch((err) => {
  console.error("Pipeline test failed:", err);
  process.exit(1);
});
