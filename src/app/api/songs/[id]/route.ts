import type { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artists, songArtists, songs } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireContentEditor, requireUser } from "@/lib/session";
import { getSongById, likedSongIds, listSongs } from "@/lib/queries";
import { isValidMediaRef } from "@/lib/utils";
import { cached, invalidate } from "@/lib/server-cache";
import { bumpFeedVersion } from "@/lib/feed-events";
import { resolveArtistByName } from "@/lib/artist-resolve";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    // Shared song core is two-tier cached (invalidated by admin edits);
    // the per-user liked flag is stamped fresh with one tiny bulk query.
    const core = await cached(`songs:one:${id}`, 60_000, async () => {
      const { rows } = await listSongs({ ids: [id], limit: 1, currentUserId: null });
      return rows[0] ?? null;
    });
    if (!core) return fail("Song not found", 404);
    const liked = await likedSongIds(session.user.id, [id]);
    return ok({ song: { ...core, liked: liked.has(id) } });
  });
}

/** Admin: update song metadata — title, genre, description, cover, and the
 *  full artist lineup (primary + featured) via primaryArtistId/Name and
 *  featuredArtistIds/Names. Artists are only rebuilt when artist fields are
 *  present, so a plain title PATCH never touches the credits. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireContentEditor(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
    if (existing.length === 0) return fail("Song not found", 404);

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === "string") patch.description = body.description.slice(0, 500);
    if (typeof body.genre === "string") patch.genre = body.genre.slice(0, 50);
    if (typeof body.coverFileId === "string") {
      if (!isValidMediaRef(body.coverFileId)) {
        return fail("Cover art must be an uploaded file or a valid image URL", 400);
      }
      patch.coverFileId = body.coverFileId;
    }
    if (Number.isFinite(Number(body.durationSec)) && Number(body.durationSec) >= 0) {
      patch.durationSec = Number(body.durationSec);
    }

    /* ------- artist lineup rebuild (only when artist fields are present) ------- */
    const wantsArtists =
      body.primaryArtistId !== undefined ||
      body.primaryArtistName !== undefined ||
      body.featuredArtistIds !== undefined ||
      body.featuredArtistNames !== undefined;

    if (wantsArtists) {
      const NIL_ID = "00000000-0000-0000-0000-000000000000";
      let primaryArtistId =
        typeof body.primaryArtistId === "string" && body.primaryArtistId !== NIL_ID
          ? body.primaryArtistId
          : "";
      if (!primaryArtistId && typeof body.primaryArtistName === "string" && body.primaryArtistName.trim()) {
        primaryArtistId = await resolveArtistByName(String(body.primaryArtistName));
      }
      // Unknown artist id (deleted artist / stale dropdown / placeholder for
      // "Unknown Artist") → fall back to the song's CURRENT binding instead
      // of failing the edit.
      if (primaryArtistId && primaryArtistId !== NIL_ID) {
        const found = await db
          .select({ id: artists.id })
          .from(artists)
          .where(eq(artists.id, primaryArtistId))
          .limit(1);
        if (found.length === 0) primaryArtistId = "";
      }
      if (!primaryArtistId) {
        primaryArtistId = existing[0]?.primaryArtistId ?? "";
      }

      if (primaryArtistId) {
        patch.primaryArtistId = primaryArtistId;

        const featuredIds: string[] = [];
        for (const fid of Array.isArray(body.featuredArtistIds) ? (body.featuredArtistIds as string[]) : []) {
          if (typeof fid === "string" && /^[0-9a-f-]{36}$/i.test(fid) && fid !== primaryArtistId && fid !== NIL_ID && !featuredIds.includes(fid)) {
            featuredIds.push(fid);
          }
        }
        for (const nm of Array.isArray(body.featuredArtistNames) ? (body.featuredArtistNames as string[]) : []) {
          if (typeof nm === "string" && nm.trim()) {
            const fid = await resolveArtistByName(nm);
            if (fid !== primaryArtistId && !featuredIds.includes(fid)) featuredIds.push(fid);
          }
        }
        // drop featured ids that no longer exist (stale dropdown entries
        // must not fail the whole edit)
        const validFeat = featuredIds.length
          ? await db.select({ id: artists.id }).from(artists).where(inArray(artists.id, featuredIds))
          : [];
        const validIds = new Set(validFeat.map((a) => a.id));
        const finalFeat = featuredIds.filter((fid) => validIds.has(fid));

        await db.delete(songArtists).where(eq(songArtists.songId, id));
        await db
          .insert(songArtists)
          .values([
            { songId: id, artistId: primaryArtistId, role: "primary" },
            ...finalFeat.map((fid) => ({ songId: id, artistId: fid, role: "featured" })),
          ])
          .onConflictDoNothing();
      }
      // no valid primary anywhere (unbound song + no name given) → skip the
      // credit rebuild; the rest of the edit (title etc.) still applies.
    }

    if (Object.keys(patch).length) {
      await db.update(songs).set(patch).where(eq(songs.id, id));
    }
    await invalidate("songs:");
    await invalidate("public-songs:");
    await bumpFeedVersion();
    const song = await getSongById(id, session.user.id);
    return ok({ song });
  });
}

/** Admin: delete a song. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireContentEditor(req);
    const { id } = await params;
    await db.delete(songs).where(eq(songs.id, id));
    await invalidate("songs:");
    await invalidate("public-songs:");
    await bumpFeedVersion();
    return ok({ deleted: true });
  });
}
