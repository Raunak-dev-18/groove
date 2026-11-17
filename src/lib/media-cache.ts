/**
 * Client-side audio cache prefetcher — the page-side half of the device cache.
 *
 * The service worker (public/sw.js) owns the on-disk cache of /api/cdn/files
 * responses and serves cached files (including Range requests, which media
 * elements always send) by slicing. This module simply warms that cache:
 *
 *  • prefetchAudio(fileId)      — fetch one full file through the SW
 *  • prefetchAudioWindow(songs) — pool-limited batch (used by the player to
 *                                 cache the playing song + the next 5)
 *
 * Songs the SW already has are skipped (checked via the Cache API directly —
 * no network, no disk-churn). One fetch per fileId at a time; completed ids
 * are remembered so hover-repeats don't re-fetch.
 */

export const SW_AUDIO_CACHE = "groove-media-v2";
const WINDOW_CONCURRENCY = 2;

const inflight = new Map<string, Promise<void>>();
const done = new Set<string>();

export function audioFileUrl(fileId: string): string {
  return `/api/cdn/files/${fileId}`;
}

/** Is this file already in the service-worker audio cache? */
async function isCached(url: string): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open(SW_AUDIO_CACHE);
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/** Warm one song into the SW cache. Cheap no-op when already cached. */
export function prefetchAudio(fileId: string): Promise<void> {
  if (!fileId || done.has(fileId)) return Promise.resolve();
  const existing = inflight.get(fileId);
  if (existing) return existing;

  const p = (async () => {
    const url = audioFileUrl(fileId);
    if (await isCached(url)) {
      done.add(fileId);
      return;
    }
    try {
      const res = await fetch(url);
      // consume the body fully so the SW's cache.put clone completes too
      if (res.ok) await res.arrayBuffer();
      done.add(fileId);
    } catch {
      /* offline / aborted — retry happens on the next attempt */
    }
  })().finally(() => inflight.delete(fileId));

  inflight.set(fileId, p);
  return p;
}

/** Fetch a batch of songs in priority order with a small parallel pool. */
export async function prefetchAudioWindow(
  songs: { audioFileId: string }[],
  concurrency = WINDOW_CONCURRENCY,
): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < songs.length) {
      await prefetchAudio(songs[i++].audioFileId);
    }
  };
  const n = Math.min(concurrency, Math.max(1, songs.length));
  await Promise.all(Array.from({ length: n }, worker));
}
