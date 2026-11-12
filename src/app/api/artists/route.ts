import type { NextRequest } from "next/server";
import { db } from "@/db";
import { artists } from "@/db/schema";
import { clampInt, fail, handle, ok } from "@/lib/api";
import { requireContentEditor, requireUser } from "@/lib/session";
import { listArtists } from "@/lib/queries";
import { isValidMediaRef } from "@/lib/utils";
import { cached, invalidate } from "@/lib/server-cache";
import { findArtistBySmartName } from "@/lib/artist-resolve";
import { bumpFeedVersion } from "@/lib/feed-events";

const ISO2 = /^[A-Za-z]{2}$/;

/** Browse artists — paginated chunks. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const url = new URL(req.url);
    const limit = clampInt(url.searchParams.get("limit"), 1, 200, 20);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100_000, 0);
    const followed = url.searchParams.get("followed") === "1";

    // Followed lists are per-user → uncached. The plain browse list is shared
    // across every user → two-tier cached (invalidated by admin mutations).
    const { rows, total } = followed
      ? await listArtists({ limit, offset, followedBy: session.user.id })
      : await cached(`artists:list:${limit}:${offset}`, 30_000, () =>
          listArtists({ limit, offset }),
        );
    const nextOffset = offset + rows.length;
    return ok({ items: rows, total, nextOffset: nextOffset < total ? nextOffset : null });
  });
}

/** Admin: create an artist. Body: { name, bio?, genre?, avatarFileId? } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireContentEditor(req);
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    if (!name) return fail("Artist name required", 400);
    if (body.avatarFileId != null && !isValidMediaRef(body.avatarFileId)) {
      return fail("Avatar must be an uploaded file or a valid image URL", 400);
    }
    const country = body.country ? String(body.country).trim().toUpperCase() : null;
    if (country && !ISO2.test(country)) {
      return fail("Country must be a 2-letter ISO code (e.g. IN, US)", 400);
    }

    // smart duplicate guard: "AR Rahman" is rejected if "A. R. Rahman" exists
    const dupe = await findArtistBySmartName(name);
    if (dupe) {
      return Response.json(
        {
          error: `An artist named "${dupe.name}" already exists (smart match) — edit that one instead of creating a duplicate`,
          duplicate: { id: dupe.id, name: dupe.name },
        },
        { status: 409 },
      );
    }

    const [artist] = await db
      .insert(artists)
      .values({
        name,
        bio: body.bio?.toString().slice(0, 1000) ?? "",
        genre: body.genre?.toString().slice(0, 50) ?? "",
        country,
        avatarFileId: body.avatarFileId ?? null,
      })
      .returning();
    await invalidate("songs:");
    await invalidate("public-songs:");
    await bumpFeedVersion();
    await invalidate("artists:");
    await bumpFeedVersion();

    return ok(
      {
        artist: {
          id: artist.id,
          name: artist.name,
          bio: artist.bio,
          genre: artist.genre,
          country: artist.country,
          avatarFileId: artist.avatarFileId,
          followers: 0,
          isFollowing: false,
        },
      },
      201,
    );
  });
}
