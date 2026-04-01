import Anthropic from "@anthropic-ai/sdk";
import {
  getUnclassifiedMarkets,
  saveSentimentClassifications,
  type SentimentDirection,
} from "@/lib/db/client";

// Lazy-init so env vars are available when running outside Next.js (e.g. scripts)
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const VALID_DIRECTIONS = new Set<SentimentDirection>([
  "positive",
  "negative",
  "neutral",
]);

/**
 * Classify a batch of prediction market questions for sentiment direction.
 * Sends up to 20 questions at once to minimize API calls.
 *
 * - positive: higher probability = society is doing better
 * - negative: higher probability = society is doing worse
 * - neutral: direction is ambiguous or not sentiment-relevant
 */
async function classifyBatch(
  markets: { id: string; question: string }[],
): Promise<{ id: string; direction: SentimentDirection }[]> {
  if (markets.length === 0) return [];

  const numbered = markets
    .map((m, i) => `${i + 1}. "${m.question}"`)
    .join("\n");

  const prompt = `Classify each prediction market question for societal sentiment direction.

For each question, reply with exactly one word: positive, negative, or neutral.

- positive: higher probability = society is doing better (economic growth, peace, stability, progress)
- negative: higher probability = society is doing worse (recession, war, disaster, decline)
- neutral: direction is ambiguous or not sentiment-relevant (elections, policy changes that could go either way)

Questions:
${numbered}

Reply with ONLY a numbered list of classifications, one per line. Example format:
1. positive
2. negative
3. neutral`;

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: markets.length * 15,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== "text") return [];

  const results: { id: string; direction: SentimentDirection }[] = [];
  const lines = text.text.trim().split("\n");

  for (const line of lines) {
    // Parse "1. positive" or "1: positive" or just "positive"
    const match = line.match(/(\d+)[.):]\s*(positive|negative|neutral)/i);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      const direction = match[2].toLowerCase() as SentimentDirection;
      if (idx >= 0 && idx < markets.length && VALID_DIRECTIONS.has(direction)) {
        results.push({ id: markets[idx].id, direction });
      }
    }
  }

  return results;
}

/**
 * Classify all unclassified markets in the database.
 * Processes in batches of 20 to keep API calls efficient.
 * Returns the number of markets classified.
 */
export async function classifyNewMarkets(): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;

  const unclassified = getUnclassifiedMarkets();
  if (unclassified.length === 0) return 0;

  const BATCH_SIZE = 50;
  const MAX_PER_CYCLE = 100; // Cap total classifications per cron cycle to limit API usage
  const toProcess = unclassified.slice(0, MAX_PER_CYCLE);
  let totalClassified = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    try {
      const results = await classifyBatch(batch);
      if (results.length > 0) {
        saveSentimentClassifications(results);
        totalClassified += results.length;
      }
    } catch (err) {
      console.error(
        `Sentiment classification failed for batch starting at ${i}:`,
        err,
      );
      // Continue with next batch — partial classification is fine
    }
  }

  return totalClassified;
}
