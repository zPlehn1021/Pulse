/**
 * PULSE v2 — Backfill Sentiment Direction
 *
 * Classifies all existing markets that don't have a sentiment_direction yet.
 * Run with: npm run backfill:sentiment
 */

// Load .env.local for ANTHROPIC_API_KEY (not auto-loaded outside Next.js)
import { readFileSync } from "fs";
try {
  const envFile = readFileSync(".env.local", "utf-8");
  for (const line of envFile.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // .env.local may not exist — that's fine if env vars are set otherwise
}

import { getUnclassifiedMarkets } from "../src/lib/db/client";
import { classifyNewMarkets } from "../src/lib/sentiment/classify";

async function main() {
  const unclassified = getUnclassifiedMarkets();
  console.log(`Found ${unclassified.length} unclassified markets.`);

  if (unclassified.length === 0) {
    console.log("Nothing to do — all markets already classified.");
    return;
  }

  console.log("Classifying in batches of 20...\n");
  const classified = await classifyNewMarkets();
  console.log(`\nDone. Classified ${classified} markets.`);

  // Show remaining unclassified (if any failed)
  const remaining = getUnclassifiedMarkets();
  if (remaining.length > 0) {
    console.log(
      `${remaining.length} markets still unclassified (classification may have failed for these).`,
    );
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
