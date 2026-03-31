import type { Platform } from "@/lib/platforms/types";

export interface RetryOptions {
  retries?: number;
  delay?: number;
  backoff?: number;
  platform?: Platform | string;
  endpoint?: string;
}

const DEFAULTS: Required<Omit<RetryOptions, "platform" | "endpoint">> = {
  retries: 2,
  delay: 2000,
  backoff: 2,
};

/**
 * Generic retry wrapper with exponential backoff.
 * Handles HTTP 429 (respects Retry-After header) and 5xx errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { retries, delay, backoff } = { ...DEFAULTS, ...opts };
  const tag = opts.platform
    ? `[${opts.platform}${opts.endpoint ? ` ${opts.endpoint}` : ""}]`
    : "[retry]";

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= retries) break;

      const waitMs = delay * Math.pow(backoff, attempt);

      // Check if it's an HTTP error we should retry
      if (err instanceof RetryableError) {
        if (err.status === 429 && err.retryAfter > 0) {
          console.warn(
            `${tag} Rate limited (429), retrying after ${err.retryAfter}s`,
          );
          await sleep(err.retryAfter * 1000);
          continue;
        }
        if (err.status >= 500) {
          console.warn(
            `${tag} Server error (${err.status}), retry ${attempt + 1}/${retries} in ${waitMs}ms`,
          );
          await sleep(waitMs);
          continue;
        }
        // 4xx (non-429) — don't retry
        break;
      }

      // Network/fetch errors — retry with backoff
      console.warn(
        `${tag} Fetch error, retry ${attempt + 1}/${retries} in ${waitMs}ms: ${err}`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}

/**
 * Error class for HTTP responses that may be retryable.
 */
export class RetryableError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly retryAfter: number = 0,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = "RetryableError";
  }
}

/**
 * Fetch wrapper that throws RetryableError for non-OK responses.
 * Use inside withRetry() for automatic retry handling.
 */
export async function fetchOrThrow(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.ok) return res;

  const retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
  throw new RetryableError(res.status, res.statusText, retryAfter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
