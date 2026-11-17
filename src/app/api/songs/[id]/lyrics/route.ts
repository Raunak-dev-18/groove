import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { artists, songs } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireContentEditor, requireUser } from "@/lib/session";
import { invalidate } from "@/lib/server-cache";
import { looksSynced } from "@/lib/lrc";
import { fetchLyricsFromLrclib } from "@/lib/lyrics-server";

/**
 * Lyrics for a song.
 *
 *  GET  (any signed-in user) — returns stored lyrics; when a song has none
 *       (and wasn't marked as searched-out), we fetch from LRCLIB on demand
 *       and persist the result. ?refresh=1 (editor) retries even after a miss.
 *  PUT  (content editor)    — store/clear lyrics manually (LRC auto-detected).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser(req);
    const { id } = await params;
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";

    const [row] = await db
      .select({
        title: songs.title,
        durationSec: songs.durationSec,
        lyrics: songs.lyrics,
        lyricsSynced: songs.lyricsSynced,
        lyricsSource: songs.lyricsSource,
        artistName: artists.name,
      })
      .from(songs)
      .leftJoin(artists, eq(artists.id, songs.primaryArtistId))
      .where(eq(songs.id, id))
      .limit(1);

    if (!row) return fail("Song not found", 404);

    if (row.lyrics) {
      return ok({ lyrics: row.lyrics, synced: row.lyricsSynced, source: row.lyricsSource });
    }

    // already searched and found nothing — don't hammer LRCLIB on every play
    if (row.lyricsSource === "miss" && !refresh) {
      return ok({ lyrics: null, synced: false, source: "miss" });
    }

    const fetched = await fetchLyricsFromLrclib(
      row.title,
      row.artistName ?? "",
      row.durationSec,
    );
    if (!fetched) {
      await db.update(songs).set({ lyricsSource: "miss" }).where(eq(songs.id, id));
      return ok({ lyrics: null, synced: false, source: "miss" });
    }

    await db
      .update(songs)
      .set({ lyrics: fetched.lyrics, lyricsSynced: fetched.synced, lyricsSource: "lrclib" })
      .where(eq(songs.id, id));
    await invalidate("songs:");
    await invalidate("public-songs:");
    return ok({ lyrics: fetched.lyrics, synced: fetched.synced, source: "lrclib" });
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireContentEditor(req);
    const { id } = await params;
    const body = (await req.json()) as { lyrics?: string; synced?: boolean };
    const lyrics = (body.lyrics ?? "").trim();
    if (lyrics.length > 100_000) return fail("Lyrics too large (max 100 KB)", 400);

    if (!lyrics) {
      await db
        .update(songs)
        .set({ lyrics: null, lyricsSynced: false, lyricsSource: null })
        .where(eq(songs.id, id));
    } else {
      const synced = typeof body.synced === "boolean" ? body.synced : looksSynced(lyrics);
      await db
        .update(songs)
        .set({ lyrics, lyricsSynced: synced, lyricsSource: "admin" })
        .where(eq(songs.id, id));
    }
    await invalidate("songs:");
    await invalidate("public-songs:");
    return ok({ stored: true });
  });
}
