import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { artists, follows } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Follow an artist. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const artist = await db.select({ id: artists.id }).from(artists).where(eq(artists.id, id)).limit(1);
    if (artist.length === 0) return fail("Artist not found", 404);

    await db
      .insert(follows)
      .values({ userId: session.user.id, artistId: id })
      .onConflictDoNothing();
    const [{ followers }] = await db
      .select({ followers: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.artistId, id));
    return ok({ following: true, followers });
  });
}

/** Unfollow an artist. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    await db
      .delete(follows)
      .where(and(eq(follows.userId, session.user.id), eq(follows.artistId, id)));
    const [{ followers }] = await db
      .select({ followers: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.artistId, id));
    return ok({ following: false, followers });
  });
}
