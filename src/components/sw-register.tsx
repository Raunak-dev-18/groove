"use client";

import { useEffect } from "react";

/**
 * Registers the media caching service worker — production only.
 *
 * In `next dev`, a controlling service worker combined with HMR causes
 * infinite page-reload loops, so in development we actively unregister any
 * Groove worker and clear its caches instead.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const isProd = process.env.NODE_ENV === "production";

    (async () => {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
      if (!isProd) {
        for (const r of regs) {
          await r.unregister().catch(() => {});
        }
        if (typeof caches !== "undefined") {
          const keys = await caches.keys().catch(() => []);
          for (const k of keys) {
            if (k.startsWith("groove-")) await caches.delete(k).catch(() => {});
          }
        }
        return;
      }
      await navigator.serviceWorker.register("/sw.js").catch(() => {
        /* caching is optional */
      });
    })();
  }, []);
  return null;
}
