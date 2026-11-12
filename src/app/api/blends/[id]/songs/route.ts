import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { blendMembers, blendSongs, blends, songs } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Add a song to the blend. Body: { songId } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const songId = (body.songId ?? "").toString();
    if (!songId) return fail("Song required", 400);

    const [blend] = await db.select().from(blends).where(eq(blends.id, id)).limit(1);
    if (!blend) return fail("Blend not found", 404);

    const member = await db
      .select({ x: blendMembers.id })
      .from(blendMembers)
      .where(and(eq(blendMembers.blendId, id), eq(blendMembers.userId, session.user.id)))
      .limit(1);
    if (member.length === 0) return fail("You are not a member of this blend", 403);

    const song = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, songId)).limit(1);
    if (song.length === 0) return fail("Song not found", 404);

    await db
      .insert(blendSongs)
      .values({ blendId: id, songId, addedById: session.user.id })
      .onConflictDoNothing();

    return ok({ added: true }, 201);
  });
}

/** Remove a song from the blend. ?songId= */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const songId = new URL(req.url).searchParams.get("songId") ?? "";
    if (!songId) return fail("Song required", 400);

    const [blend] = await db.select().from(blends).where(eq(blends.id, id)).limit(1);
    if (!blend) return fail("Blend not found", 404);

    const member = await db
      .select({ x: blendMembers.id })
      .from(blendMembers)
      .where(and(eq(blendMembers.blendId, id), eq(blendMembers.userId, session.user.id)))
      .limit(1);
    if (member.length === 0) return fail("You are not a member of this blend", 403);

    await db
      .delete(blendSongs)
      .where(and(eq(blendSongs.blendId, id), eq(blendSongs.songId, songId)));
    return ok({ removed: true });
  });
}
