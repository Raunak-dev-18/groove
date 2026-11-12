/**
 * Upstash Redis (REST) — shared cache backend for hot API data.
 *
 * Reads `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` from env.
 * If Redis is unreachable (missing env, network hiccup, quota exhausted)
 * callers silently fall back to the in-memory tier — the app keeps working.
 */
import { Redis } from "@upstash/redis";

let client: Redis | null = null;
let unavailable = false;

/** Namespace so dev / prod can share one Redis instance safely. */
export const KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? "groove:";

export function redisClient(): Redis | null {
  if (unavailable) return null;
  if (client) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    unavailable = true;
    return null;
  }
  try {
    client = new Redis({ url, token });
  } catch {
    unavailable = true;
    return null;
  }
  return client;
}

/** Namespaced key — all Groove cache keys share a prefix. */
export function rkey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}
