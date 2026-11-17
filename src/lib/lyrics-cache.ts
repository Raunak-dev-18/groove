/**
 * Persistent client-side lyrics cache.
 *
 * Lyrics are immutable for practical purposes (the server already persists
 * its own copy), so once fetched we keep them:
 *   • in memory for the session
 *   • in localStorage across sessions (LRU-capped)
 * "Not found" results are cached too (with a short TTL) so opening the
 * lyrics panel for a lyric-less song never re-hammers the API.
 */

export interface LyricsData {
  lyrics: string | null;
  synced: boolean;
  source: string | null;
}

const LS_PREFIX = "groove-lyrics:";
const MAX_ENTRIES = 400;
const MISS_TTL_MS = 30 * 60 * 1000; // re-try "no lyrics" answers after 30 min

const mem = new Map<string, LyricsData & { at: number }>();

function readLs(songId: string): (LyricsData & { at: number }) | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + songId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LyricsData & { at: number };
    if (!parsed || typeof parsed.at !== "number") return null;
    // expired miss → treat as absent
    if (!parsed.lyrics && Date.now() - parsed.at > MISS_TTL_MS) {
      localStorage.removeItem(LS_PREFIX + songId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLs(songId: string, data: LyricsData) {
  try {
    localStorage.setItem(LS_PREFIX + songId, JSON.stringify({ ...data, at: Date.now() }));
    evictIfNeeded();
  } catch {
    /* quota — drop the oldest and move on */
    try {
      evictIfNeeded(true);
    } catch {
      /* non-fatal */
    }
  }
}

function evictIfNeeded(force = false) {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(LS_PREFIX)) ids.push(k.slice(LS_PREFIX.length));
  }
  if (ids.length <= MAX_ENTRIES && !force) return;
  const entries = ids
    .map((id) => ({ id, at: readLs(id)?.at ?? 0 }))
    .sort((a, b) => a.at - b.at); // oldest first
  const excess = force ? Math.ceil(entries.length / 4) : entries.length - MAX_ENTRIES;
  for (const e of entries.slice(0, Math.max(0, excess))) {
    try {
      localStorage.removeItem(LS_PREFIX + e.id);
    } catch {
      /* ignore */
    }
  }
}

/** Cached lyrics for this song, or null when we've never asked. */
export function peekLyrics(songId: string): LyricsData | null {
  const m = mem.get(songId);
  if (m) {
    if (!m.lyrics && Date.now() - m.at > MISS_TTL_MS) return null; // expired miss
    return m;
  }
  const ls = readLs(songId);
  if (ls) {
    mem.set(songId, ls);
    return ls;
  }
  return null;
}

function store(songId: string, data: LyricsData) {
  const wrapped = { ...data, at: Date.now() };
  mem.set(songId, wrapped);
  writeLs(songId, data);
}

/** Cache-first lyrics fetch — the network is only hit on a true miss. */
export async function getLyrics(songId: string): Promise<LyricsData | null> {
  const hit = peekLyrics(songId);
  if (hit) return hit;
  try {
    const res = await fetch(`/api/songs/${songId}/lyrics`).then((r) => r.json());
    const data: LyricsData = {
      lyrics: res?.lyrics ?? null,
      synced: !!res?.synced,
      source: res?.source ?? null,
    };
    store(songId, data);
    return data;
  } catch {
    return null; // offline / error — not cached, retried on next open
  }
}

/** Drop a song's cached lyrics (admin edited them / force refresh). */
export function dropLyrics(songId: string) {
  mem.delete(songId);
  try {
    localStorage.removeItem(LS_PREFIX + songId);
  } catch {
    /* ignore */
  }
}
