/**
 * Two-tier TTL cache for hot, shared (non-user-specific) API data.
 *
 *   L1 — in-process Map, ~3s. Absorbs request bursts with zero latency.
 *   L2 — Upstash Redis, full TTL. Shared across ALL server instances and
 *        survives restarts, so a warm cache is a cluster-wide warm cache.
 *
 * Every existing call site (sessions, song lists, taste profiles, feed
 * version) gets the Redis tier for free — same `cached(key, ttl, make)` API.
 *
 * Invalidation clears L1 synchronously and deletes the matching keys in
 * Redis, so on multi-instance deployments stale data ages out within the
 * 3s L1 window. If Redis is unavailable everything degrades to pure
 * in-memory caching — the app never breaks.
 */
import { redisClient, rkey } from "@/lib/redis";

const store = new Map<string, { value: unknown; expires: number }>();

/** L1 is deliberately short so cross-instance invalidation lands quickly. */
const L1_TTL_MS = 3_000;

const DATE_KEY_RE = /At$/; // createdAt, updatedAt, expiresAt, computedAt …
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * JSON round-trips Date objects into ISO strings. Values cached in memory
 * keep real Dates, so restore parity for Redis reads — otherwise date
 * comparisons on sessions/profiles would silently misbehave.
 */
function reviveDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] =
        typeof v === "string" && DATE_KEY_RE.test(k) && ISO_DATE_RE.test(v)
          ? new Date(v)
          : reviveDates(v);
    }
    return out;
  }
  return value;
}

export async function cached<T>(key: string, ttlMs: number, make: () => Promise<T>): Promise<T> {
  // ── L1: in-process ──
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const l1Expiry = Date.now() + Math.min(ttlMs, L1_TTL_MS);

  // ── L2: Redis ──
  const r = redisClient();
  if (r) {
    try {
      const raw = await r.get(rkey(key));
      if (raw !== null) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const value = reviveDates(parsed) as T;
        store.set(key, { value, expires: l1Expiry });
        return value;
      }
    } catch {
      /* Redis hiccup → fall through to make() */
    }
  }

  const value = await make();
  store.set(key, { value, expires: l1Expiry });
  if (r) {
    try {
      await r.set(rkey(key), JSON.stringify(value), { px: ttlMs });
    } catch {
      /* cache write is best-effort */
    }
  }
  return value;
}

/** Drop every cache entry (both tiers) whose key starts with `prefix`. */
export async function invalidate(prefix: string): Promise<void> {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
  const r = redisClient();
  if (!r) return;
  try {
    const keys = await r.keys(rkey(prefix) + "*");
    if (keys.length > 0) await r.del(...keys);
  } catch {
    /* other instances age entries out via TTL */
  }
}

/** Clear everything (tests / admin full refresh). */
export async function invalidateAll(): Promise<void> {
  store.clear();
  const r = redisClient();
  if (!r) return;
  for (const prefix of ["songs:", "public-songs:", "artists:", "userprofile:"]) {
    try {
      const keys = await r.keys(rkey(prefix) + "*");
      if (keys.length > 0) await r.del(...keys);
    } catch {
      /* best-effort */
    }
  }
}
