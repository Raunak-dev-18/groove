/**
 * Global content version — bumped by admin mutations, polled by clients.
 *
 * Backed by Upstash Redis so every server instance sees the same counter
 * and bumps propagate instantly across the cluster. Falls back to an
 * in-memory counter when Redis is unavailable.
 */
import { redisClient, rkey } from "@/lib/redis";

const REDIS_KEY = rkey("feed:version");
const L1_MS = 3_000; // absorb the 5s polling storm per instance

let localVersion = 0;
let l1 = { value: 0, expires: 0 };

/** Bump the version (admin uploaded / edited / deleted content). */
export async function bumpFeedVersion(): Promise<void> {
  localVersion++;
  const r = redisClient();
  if (!r) return;
  try {
    const v = await r.incr(REDIS_KEY);
    localVersion = v;
  } catch {
    /* memory-only fallback — other instances catch up via TTL/restart */
  }
}

/** Current version — L1 memory first, then one Redis GET. ~free either way. */
export async function getFeedVersion(): Promise<number> {
  if (l1.expires > Date.now()) return l1.value;
  const r = redisClient();
  if (r) {
    try {
      const v = await r.get(REDIS_KEY);
      const n = typeof v === "number" ? v : localVersion;
      localVersion = n;
      l1 = { value: n, expires: Date.now() + L1_MS };
      return n;
    } catch {
      /* fall through to local */
    }
  }
  l1 = { value: localVersion, expires: Date.now() + L1_MS };
  return localVersion;
}
