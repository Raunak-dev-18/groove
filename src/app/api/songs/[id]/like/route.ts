import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { likes, songs } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Like a song. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const song = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, id)).limit(1);
    if (song.length === 0) return fail("Song not found", 404);

    await db.insert(likes).values({ userId: session.user.id, songId: id }).onConflictDoNothing();
    return ok({ liked: true });
  });
}

/** Unlike a song. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    await db
      .delete(likes)
      .where(and(eq(likes.userId, session.user.id), eq(likes.songId, id)));
    return ok({ liked: false });
  });
}
