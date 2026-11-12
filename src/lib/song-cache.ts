import { api } from "@/lib/client";
import type { ArtistDTO, SongDTO } from "@/lib/types";

/**
 * Client-side prefetch cache. Hovering a track/artist card warms the data
 * before the user clicks, so /track and /artists pages render instantly.
 */

const songCache = new Map<string, Promise<SongDTO | null>>();
const artistCache = new Map<string, Promise<{ artist: ArtistDTO; topSongs: SongDTO[] } | null>>();
const listCache = new Map<string, Promise<unknown>>();

export function prefetchSong(id: string) {
  if (!id || songCache.has(id)) return;
  const p = api<{ song: SongDTO }>(`/api/songs/${id}`)
    .then((r) => r.song)
    .catch(() => null);
  songCache.set(id, p);
  // don't grow forever
  if (songCache.size > 200) songCache.delete(songCache.keys().next().value as string);
}

export function getSong(id: string): Promise<SongDTO | null> {
  prefetchSong(id);
  return songCache.get(id)!;
}

export function prefetchArtist(id: string) {
  if (!id || artistCache.has(id)) return;
  const p = api<{ artist: ArtistDTO; topSongs: SongDTO[] }>(`/api/artists/${id}`)
    .then((r) => ({ artist: r.artist, topSongs: r.topSongs }))
    .catch(() => null);
  artistCache.set(id, p);
  if (artistCache.size > 100) artistCache.delete(artistCache.keys().next().value as string);
}

export function getArtist(id: string): Promise<{ artist: ArtistDTO; topSongs: SongDTO[] } | null> {
  prefetchArtist(id);
  return artistCache.get(id)!;
}

/** Generic chunk prefetcher for paginated lists (e.g. artists grid). */
export function prefetchList<T>(key: string, path: string): Promise<T> {
  const existing = listCache.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = api<T>(path).catch(() => null as unknown as T);
  listCache.set(key, p);
  return p;
}

export function dropList(key: string) {
  listCache.delete(key);
}
