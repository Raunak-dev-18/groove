"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Detects when content changes (admin uploads, edits, deletes) so pages
 * can refetch instantly instead of waiting for a manual refresh.
 *
 * - Polls /api/feed-version every 5s (one integer, no auth, no DB — free)
 * - Refetches when the browser tab regains focus
 * - Returns a `refreshKey` that pages use as an effect dependency
 *
 * Usage:
 *   const { refreshKey } = useFeedVersion();
 *   useEffect(() => { fetchData(); }, [refreshKey]);
 */
export function useFeedVersion(intervalMs = 5000) {
  const [refreshKey, setRefreshKey] = useState(0);
  const lastVersion = useRef<number | null>(null);
  const fetched = useRef(false);
  const pauseUntil = useRef(0);

  const check = useCallback(async () => {
    // Back off after a 429 — hammering a rate-limited edge only prolongs it
    if (Date.now() < pauseUntil.current) return;
    // Hidden tabs don't need live updates; visibilitychange catches up on focus
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/feed-version", { cache: "no-store" });
      if (res.status === 429) {
        pauseUntil.current = Date.now() + 30_000;
        return;
      }
      const data = await res.json();
      const v = data?.v;
      if (typeof v === "number") {
        if (lastVersion.current !== null && v !== lastVersion.current) {
          // content changed → bump the refresh key so consumers refetch
          setRefreshKey((k) => k + 1);
        }
        lastVersion.current = v;
      }
    } catch {
      /* offline — next poll will catch up */
    }
  }, []);

  // initial fetch + interval polling
  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      void check();
    }
    const t = setInterval(check, intervalMs);
    return () => clearInterval(t);
  }, [check, intervalMs]);

  // refetch when the tab becomes visible again
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [check]);

  return { refreshKey };
}
