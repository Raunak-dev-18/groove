import type { NextRequest } from "next/server";
import { clampInt, handle, ok } from "@/lib/api";
import { listSongs } from "@/lib/queries";
import { cached } from "@/lib/server-cache";

/**
 * Public song list for browsing — no auth required.
 * Used by Abnormal's music note picker and any external client.
 * Returns limited fields (no user-specific data like liked status).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url);
    const limit = clampInt(url.searchParams.get("limit"), 1, 200, 20);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100_000, 0);
    const q = url.searchParams.get("q");
    const sortParam = url.searchParams.get("sort");
    const sort = sortParam === "new" || sortParam === "title" ? sortParam : "popular";

    const key = `public-songs:${limit}:${offset}:${q ?? ""}:${sort}`;
    const data = await cached(key, 60_000, async () => {
      if (q) {
        const { searchAll } = await import("@/lib/queries");
        const result = await searchAll(q, null);
        return result.songs.slice(0, limit).map((s) => ({
          id: s.id,
          title: s.title,
          artist: s.artists.map((a) => a.name).join(", "),
          coverFileId: s.coverFileId,
          audioFileId: s.audioFileId,
          durationSec: s.durationSec,
          genre: s.genre,
        }));
      }
      const { rows } = await listSongs({ limit, offset, sort, currentUserId: null });
      return rows.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artists.map((a) => a.name).join(", "),
        coverFileId: s.coverFileId,
        audioFileId: s.audioFileId,
        durationSec: s.durationSec,
        genre: s.genre,
      }));
    });

    return ok({ songs: data });
  });
}
