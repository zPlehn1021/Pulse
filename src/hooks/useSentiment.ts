"use client";

import useSWR from "swr";
import { useRef } from "react";
import type { CompositeIndex } from "@/lib/platforms/types";

interface SentimentResponse {
  index: CompositeIndex;
  history: CompositeIndex[];
  fearGreed: { current: unknown; history: unknown[] } | null;
  platformStatus: Record<
    string,
    { available: boolean; count: number }
  >;
  totalMarkets: number;
  meta: {
    platforms: Record<string, unknown>;
    fetchDuration: number;
    timestamp: string;
  };
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    return r.json();
  });

export function useSentiment() {
  const refreshInterval = parseInt(
    process.env.NEXT_PUBLIC_REFRESH_INTERVAL || "60000",
    10,
  );

  // Keep last good data across error states
  const lastGoodData = useRef<SentimentResponse | null>(null);

  const { data, error, isLoading, mutate } = useSWR<SentimentResponse>(
    "/api/sentiment",
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      errorRetryCount: 3,
      keepPreviousData: true,
      onSuccess(freshData) {
        lastGoodData.current = freshData;
      },
    },
  );

  // Use current data, or fall back to last known good data on error
  const effective = data ?? lastGoodData.current;
  const isStale = !!error && !!effective;

  return {
    index: effective?.index ?? null,
    history: effective?.history ?? [],
    fearGreed: effective?.fearGreed ?? null,
    platformStatus: effective?.platformStatus ?? {},
    totalMarkets: effective?.totalMarkets ?? 0,
    meta: effective?.meta ?? null,
    isLoading,
    isError: !!error,
    isStale,
    error,
    mutate,
  };
}
