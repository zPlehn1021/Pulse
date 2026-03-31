"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const STALE_THRESHOLD_MS = 120_000; // 2 minutes

export function useAutoRefresh(lastUpdatedTimestamp: Date | string | null) {
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(0);
  const lastUpdatedMs = useRef(0);

  // Update the reference timestamp when new data arrives
  useEffect(() => {
    if (lastUpdatedTimestamp) {
      lastUpdatedMs.current =
        typeof lastUpdatedTimestamp === "string"
          ? new Date(lastUpdatedTimestamp).getTime()
          : lastUpdatedTimestamp.getTime();
      setSecondsSinceRefresh(0);
    }
  }, [lastUpdatedTimestamp]);

  // Tick every second to update the counter
  useEffect(() => {
    const id = setInterval(() => {
      if (lastUpdatedMs.current > 0) {
        const elapsed = Math.floor(
          (Date.now() - lastUpdatedMs.current) / 1000,
        );
        setSecondsSinceRefresh(elapsed);
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  const isStale = secondsSinceRefresh > STALE_THRESHOLD_MS / 1000;

  return { secondsSinceRefresh, isStale };
}
