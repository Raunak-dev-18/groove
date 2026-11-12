import type { NextRequest } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { artists, songArtists, songs } from "@/db/schema";
import { clampInt, fail, handle, ok } from "@/lib/api";
import { requireContentEditor, requireUser } from "@/lib/session";
import { getSongById, listSongs } from "@/lib/queries";
import { isValidMediaRef } from "@/lib/utils";
import { invalidate } from "@/lib/server-cache";
import { bumpFeedVersion } from "@/lib/feed-events";
import { findDuplicates } from "@/lib/duplicate-server";
import { resolveArtistByName, UUID_RE } from "@/lib/artist-resolve";

/** Browse songs — paginated chunks. ?limit=&offset=&sort=new|popular|title&artistId= */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const url = new URL(req.url);
    const limit = clampInt(url.searchParams.get("limit"), 1, 200, 20);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100_000, 0);
    const sortParam = url.searchParams.get("sort");
    const sort = sortParam === "popular" || sortParam === "title" ? sortParam : "new";
    const artistId = url.searchParams.get("artistId") ?? undefined;

    const { rows, total } = await listSongs({
      limit,
      offset,
      sort,
      artistId,
      currentUserId: session.user.id,
    });

    const nextOffset = offset + rows.length;
    return ok({
      items: rows,
      total,
      nextOffset: nextOffset < total ? nextOffset : null,
    });
  });
}

/** Admin: create a song. Body: { title, primaryArtistId | primaryArtistName,
 *  featuredArtistIds? | featuredArtistNames?, audioFileId, coverFileId?,
 *  durationSec?, genre?, description? }. Artists given by name are matched
 *  case-insensitively and created when missing (powers filename auto-fill
 *  and bulk uploads). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireContentEditor(req);
    const body = await req.json();

    const { title, audioFileId } = body as {
      title?: string;
      audioFileId?: string;
    };
    if (!title?.trim()) return fail("Title required", 400);
    if (!audioFileId) return fail("Audio file required", 400);
    // audio must be an uploaded file — pasted URLs are only for images
    if (/^https?:\/\//i.test(audioFileId)) {
      return fail("Audio must be an uploaded file (URLs are only for images)", 400);
    }
    if (body.coverFileId && !isValidMediaRef(body.coverFileId)) {
      return fail("Cover art must be an uploaded file or a valid image URL", 400);
    }

    // primary artist: id or name (name is matched/created automatically)
    let primaryArtistId = typeof body.primaryArtistId === "string" ? body.primaryArtistId : "";
    if (!primaryArtistId && typeof body.primaryArtistName === "string" && body.primaryArtistName.trim()) {
      primaryArtistId = await resolveArtistByName(String(body.primaryArtistName));
    }
    if (!primaryArtistId) return fail("Primary artist required", 400);

    const artist = await db.select().from(artists).where(eq(artists.id, primaryArtistId)).limit(1);
    if (artist.length === 0) return fail("Artist not found", 404);
    const primaryArtistName = artist[0].name;

    // ─── duplicate guard ───
    // Same song (normalized title) by the same artist already in the library
    // → refuse. Admins can tweak the title/artist if they truly want a
    // second copy (e.g. "Title - Live" vs "Title").
    if (body.allowDuplicate !== true) {
      const [dupe] = await findDuplicates([{ title: title.trim(), artist: primaryArtistName }]);
      if (dupe) {
        return Response.json(
          {
            error: `"${dupe.title}" by ${dupe.artist} is already in your library`,
            duplicate: dupe,
          },
          { status: 409 },
        );
      }
    }

    // featured artists: mix of ids and names
    const featuredIds: string[] = [];
    for (const id of Array.isArray(body.featuredArtistIds) ? (body.featuredArtistIds as string[]) : []) {
      if (UUID_RE.test(id) && id !== primaryArtistId && !featuredIds.includes(id)) featuredIds.push(id);
    }
    for (const nm of Array.isArray(body.featuredArtistNames) ? (body.featuredArtistNames as string[]) : []) {
      if (typeof nm === "string" && nm.trim()) {
        const id = await resolveArtistByName(nm);
        if (id !== primaryArtistId && !featuredIds.includes(id)) featuredIds.push(id);
      }
    }
    if (featuredIds.length) {
      const valid = await db
        .select({ id: artists.id })
        .from(artists)
        .where(inArray(artists.id, featuredIds));
      if (valid.length !== featuredIds.length) return fail("A featured artist was not found", 400);
    }

    // auto-description when blank: "Song by X feat. Y"
    let description = body.description?.toString().slice(0, 500) ?? "";
    if (!description.trim()) {
      const featuredNames = featuredIds.length
        ? (await db.select({ name: artists.name }).from(artists).where(inArray(artists.id, featuredIds)))
            .map((a) => a.name)
        : [];
      const names = [primaryArtistName, ...featuredNames].join(", ");
      description = `Song by ${names}`;
    }

    const [created] = await db
      .insert(songs)
      .values({
        title: title.trim(),
        description,
        audioFileId,
        coverFileId: body.coverFileId ?? null,
        durationSec: Number(body.durationSec) > 0 ? Number(body.durationSec) : 0,
        genre: body.genre?.toString().slice(0, 50) ?? "",
        primaryArtistId,
        createdBy: session.user.id,
      })
      .returning();

    const rows = [
      { songId: created.id, artistId: primaryArtistId, role: "primary" },
      ...featuredIds.map((id: string) => ({ songId: created.id, artistId: id, role: "featured" })),
    ];
    await db.insert(songArtists).values(rows).onConflictDoNothing();
    await invalidate("songs:");
    await invalidate("public-songs:");
    await bumpFeedVersion();

    const song = await getSongById(created.id, session.user.id);
    return ok({ song }, 201);
  });
}
