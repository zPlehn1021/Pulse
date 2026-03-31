/**
 * PULSE API Debug Script
 *
 * Fetches each upstream platform API directly and logs the raw response shape.
 * Useful for debugging when an API changes its schema.
 * Run with: npm run test:apis
 */

const APIS = [
  {
    name: "Polymarket (Gamma API) — /markets",
    url: "https://gamma-api.polymarket.com/markets?tag_id=2&closed=false&order=volume24hr&ascending=false&limit=2",
  },
  {
    name: "Kalshi — /markets",
    url: "https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=2",
  },
  {
    name: "Manifold — /search-markets",
    url: "https://api.manifold.markets/v0/search-markets?sort=liquidity&limit=2&filter=open",
  },
  {
    name: "PredictIt — /marketdata/all",
    url: "https://www.predictit.org/api/marketdata/all/",
  },
  {
    name: "Fear & Greed Index — /fng",
    url: "https://api.alternative.me/fng/?limit=1&format=json",
  },
];

function describeShape(obj: unknown, depth = 0, maxDepth = 3): string {
  if (depth >= maxDepth) return typeof obj;
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return `Array(${obj.length}) [${describeShape(obj[0], depth + 1, maxDepth)}]`;
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>)
      .slice(0, 15)
      .map(([k, v]) => {
        const type =
          v === null
            ? "null"
            : Array.isArray(v)
              ? `Array(${v.length})`
              : typeof v === "object"
                ? describeShape(v, depth + 1, maxDepth)
                : `${typeof v} = ${String(v).slice(0, 50)}`;
        return `    ${"  ".repeat(depth)}${k}: ${type}`;
      });
    return `{\n${entries.join("\n")}\n${"  ".repeat(depth)}  }`;
  }
  return `${typeof obj} = ${String(obj).slice(0, 80)}`;
}

async function testApi(name: string, url: string) {
  console.log(`\n▸ ${name}`);
  console.log(`  URL: ${url}`);

  try {
    const start = Date.now();
    const res = await fetch(url);
    const elapsed = Date.now() - start;

    console.log(`  Status: ${res.status} ${res.statusText}`);
    console.log(`  Time: ${elapsed}ms`);
    console.log(
      `  Content-Type: ${res.headers.get("content-type")}`,
    );

    if (!res.ok) {
      const text = await res.text();
      console.log(`  Error body: ${text.slice(0, 200)}`);
      return;
    }

    const data = await res.json();

    // Show top-level shape
    console.log(`  Response shape:`);
    if (Array.isArray(data)) {
      console.log(`    Array(${data.length})`);
      if (data.length > 0) {
        console.log(`    First item shape: ${describeShape(data[0])}`);
      }
    } else {
      console.log(`    ${describeShape(data)}`);
    }

    // If there's a nested markets/questions array, show its item shape
    const nested = (data as Record<string, unknown>).markets ??
      (data as Record<string, unknown>).results ??
      (data as Record<string, unknown>).questions;
    if (Array.isArray(nested) && nested.length > 0) {
      console.log(`\n    First item fields:`);
      const item = nested[0] as Record<string, unknown>;
      for (const [k, v] of Object.entries(item).slice(0, 20)) {
        const display =
          v === null
            ? "null"
            : typeof v === "string"
              ? `"${v.slice(0, 60)}"`
              : typeof v === "object"
                ? JSON.stringify(v).slice(0, 80)
                : String(v);
        console.log(`      ${k}: ${display}`);
      }
    }
  } catch (err) {
    console.log(`  ✗ FETCH ERROR: ${err}`);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║          PULSE Upstream API Debug Tool                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  for (const api of APIS) {
    await testApi(api.name, api.url);
  }

  console.log("\n─".repeat(60));
  console.log("API debug complete.\n");
}

main().catch((err) => {
  console.error("API test failed:", err);
  process.exit(1);
});
