import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { artists, songs } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireContentEditor, requireUser } from "@/lib/session";
import { getArtistById, listSongs } from "@/lib/queries";
import { isValidMediaRef } from "@/lib/utils";
import { invalidate } from "@/lib/server-cache";
import { bumpFeedVersion } from "@/lib/feed-events";
import { findArtistBySmartName } from "@/lib/artist-resolve";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const artist = await getArtistById(id, session.user.id);
    if (!artist) return fail("Artist not found", 404);
    const top = await listSongs({ artistId: id, sort: "popular", limit: 10, currentUserId: session.user.id });
    return ok({ artist, topSongs: top.rows });
  });
}

/** Admin: update artist. Renames propagate everywhere instantly — song
 * details read the artist by reference, and stored description snapshots
 * ("Song by X feat. Y") are rewritten with the new name. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireContentEditor(req);
    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.bio === "string") patch.bio = body.bio.slice(0, 1000);
    if (typeof body.genre === "string") patch.genre = body.genre.slice(0, 50);
    if (body.country !== undefined) {
      const country = body.country ? String(body.country).trim().toUpperCase() : null;
      if (country && !/^[A-Za-z]{2}$/.test(country)) {
        return fail("Country must be a 2-letter ISO code (e.g. IN, US)", 400);
      }
      patch.country = country;
    }
    if (typeof body.avatarFileId === "string") {
      if (!isValidMediaRef(body.avatarFileId)) {
        return fail("Avatar must be an uploaded file or a valid image URL", 400);
      }
      patch.avatarFileId = body.avatarFileId;
    }

    if (Object.keys(patch).length) {
      // renaming must not collide with another artist under smart matching
      if (typeof patch.name === "string") {
        const [current] = await db.select({ name: artists.name }).from(artists).where(eq(artists.id, id)).limit(1);
        if (!current) return fail("Artist not found", 404);
        const clash = await findArtistBySmartName(patch.name as string, id);
        if (clash) {
          return fail(`That name already exists as "${clash.name}" — merge or edit that artist instead`, 409);
        }
        // rewrite stored description snapshots so song details follow the rename
        await db
          .update(songs)
          .set({ description: sql`replace(${songs.description}, ${current.name}, ${patch.name as string})` })
          .where(sql`${songs.description} ilike ${`%${current.name}%`}`);
      }
      await db.update(artists).set(patch).where(eq(artists.id, id));
      await invalidate("songs:");
      await invalidate("public-songs:");
      await invalidate("artists:");
      await invalidate("artists:allnames");
      await bumpFeedVersion();
    }
    const artist = await getArtistById(id);
    if (!artist) return fail("Artist not found", 404);
    return ok({ artist });
  });
}

/** Admin: delete artist. Their songs survive — the FK unbinds the artist
 * (ON DELETE SET NULL) and the songs show as "Unknown Artist" instead of
 * being deleted. Returns how many songs were unbound. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireContentEditor(req);
    const { id } = await params;
    const bound = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(songs)
      .where(eq(songs.primaryArtistId, id));
    await db.delete(artists).where(eq(artists.id, id));
    await invalidate("songs:");
    await invalidate("public-songs:");
    await bumpFeedVersion();
    await invalidate("artists:");
    await invalidate("artists:allnames");
    await bumpFeedVersion();
    return ok({ deleted: true, songsUnbound: bound[0]?.n ?? 0 });
  });
}
