/**
 * Server-side duplicate lookups — used by POST /api/songs (authoritative
 * 409 guard before insert) and POST /api/songs/check-duplicates (batch
 * pre-check for the bulk upload queue).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { artists, songArtists, songs } from "@/db/schema";
import { songDuplicateKey } from "@/lib/duplicate";

export interface DuplicateCandidate {
  title: string;
  artist: string;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  artist: string;
}

/** All songs with their primary artist, keyed by normalized title::artist. */
export async function loadDuplicateIndex(): Promise<Map<string, DuplicateMatch>> {
  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artistName: artists.name,
    })
    .from(songs)
    .innerJoin(songArtists, eq(songArtists.songId, songs.id))
    .innerJoin(artists, eq(artists.id, songArtists.artistId))
    .where(eq(songArtists.role, "primary"))
    .limit(5000);

  const index = new Map<string, DuplicateMatch>();
  for (const r of rows) {
    const key = songDuplicateKey(r.title, r.artistName ?? "");
    if (!index.has(key)) {
      index.set(key, { id: r.id, title: r.title, artist: r.artistName ?? "" });
    }
  }
  return index;
}

/** Find the first existing song matching any candidate. Returns matches per candidate. */
export async function findDuplicates(
  candidates: DuplicateCandidate[],
): Promise<(DuplicateMatch | null)[]> {
  const index = await loadDuplicateIndex();
  return candidates.map((c) => index.get(songDuplicateKey(c.title, c.artist)) ?? null);
}
