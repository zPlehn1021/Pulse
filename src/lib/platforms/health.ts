import type { Platform } from "@/lib/platforms/types";

export type HealthStatus = "healthy" | "degraded" | "down";

interface PlatformHealthState {
  status: HealthStatus;
  consecutiveFailures: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  degradedAt: number | null;
}

const FAILURE_THRESHOLD = 3;
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const ALL_PLATFORMS: Platform[] = [
  "polymarket",
  "kalshi",
  "manifold",
  "predictit",
  "feargreed",
];

const state: Record<Platform, PlatformHealthState> = {} as Record<
  Platform,
  PlatformHealthState
>;

// Initialize all platforms as healthy
for (const p of ALL_PLATFORMS) {
  state[p] = {
    status: "healthy",
    consecutiveFailures: 0,
    lastFailure: null,
    lastSuccess: null,
    degradedAt: null,
  };
}

/**
 * Record a successful fetch for a platform.
 * Resets failure count and restores healthy status.
 */
export function recordSuccess(platform: Platform): void {
  const s = state[platform];
  if (!s) return;
  s.status = "healthy";
  s.consecutiveFailures = 0;
  s.lastSuccess = Date.now();
  s.degradedAt = null;
}

/**
 * Record a failed fetch for a platform.
 * After FAILURE_THRESHOLD consecutive failures, marks as degraded.
 */
export function recordFailure(platform: Platform): void {
  const s = state[platform];
  if (!s) return;
  s.consecutiveFailures++;
  s.lastFailure = Date.now();

  if (s.consecutiveFailures >= FAILURE_THRESHOLD && s.status === "healthy") {
    s.status = "degraded";
    s.degradedAt = Date.now();
    console.warn(
      `[health] ${platform} marked as degraded after ${s.consecutiveFailures} failures`,
    );
  }
}

/**
 * Check if a degraded platform should attempt recovery.
 * Returns true if the platform has been degraded for longer than
 * RECOVERY_INTERVAL_MS and should be retried.
 */
export function shouldAttemptRecovery(platform: Platform): boolean {
  const s = state[platform];
  if (!s || s.status === "healthy") return true;
  if (s.degradedAt === null) return true;
  return Date.now() - s.degradedAt >= RECOVERY_INTERVAL_MS;
}

/**
 * Get the current health status of all platforms.
 */
export function getPlatformHealth(): Record<Platform, HealthStatus> {
  const result = {} as Record<Platform, HealthStatus>;
  for (const p of ALL_PLATFORMS) {
    result[p] = state[p]?.status ?? "healthy";
  }
  return result;
}

/**
 * Get detailed health info for debugging/admin endpoints.
 */
export function getPlatformHealthDetails(): Record<Platform, PlatformHealthState> {
  return { ...state };
}
