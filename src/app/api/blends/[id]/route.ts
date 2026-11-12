import type { NextRequest } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blendMembers, blendSongs, blends, user } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { blendTasteMatch, listSongs } from "@/lib/queries";

/** Blend detail: members, taste match, collaborative tracklist. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;

    const [blend] = await db.select().from(blends).where(eq(blends.id, id)).limit(1);
    if (!blend) return fail("Blend not found", 404);

    const members = await db
      .select({ userId: blendMembers.userId, name: user.name, image: user.image, joinedAt: blendMembers.createdAt })
      .from(blendMembers)
      .innerJoin(user, eq(user.id, blendMembers.userId))
      .where(eq(blendMembers.blendId, id))
      .orderBy(desc(blendMembers.createdAt));

    const isMember = members.some((m) => m.userId === session.user.id);
    if (!isMember) return fail("You are not a member of this blend", 403);

    const songRows = await db
      .select({ songId: blendSongs.songId, addedById: blendSongs.addedById, addedAt: blendSongs.addedAt })
      .from(blendSongs)
      .where(eq(blendSongs.blendId, id))
      .orderBy(desc(blendSongs.addedAt))
      .limit(200);

    const songIds = songRows.map((s) => s.songId);
    const { rows } = await listSongs({ ids: songIds, limit: 200, currentUserId: session.user.id });
    const adderIds = [...new Set(songRows.map((s) => s.addedById))];
    const adders = adderIds.length
      ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, adderIds))
      : [];
    const adderMap = new Map(adders.map((a) => [a.id, a.name]));

    const tasteMatch = await blendTasteMatch(id);

    return ok({
      blend: {
        id: blend.id,
        name: blend.name,
        code: blend.code,
        ownerId: blend.ownerId,
        createdAt: blend.createdAt.toISOString(),
        tasteMatch,
        members: members.map((m) => ({
          id: m.userId,
          name: m.name,
          image: m.image ?? null,
          isOwner: m.userId === blend.ownerId,
        })),
        songs: rows.map((s) => ({
          ...s,
          addedByName: adderMap.get(songRows.find((r) => r.songId === s.id)?.addedById ?? "") ?? "Someone",
        })),
      },
    });
  });
}

/** Owner: delete the blend. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const [blend] = await db.select().from(blends).where(eq(blends.id, id)).limit(1);
    if (!blend) return fail("Blend not found", 404);
    if (blend.ownerId !== session.user.id) return fail("Only the owner can delete this blend", 403);
    await db.delete(blends).where(eq(blends.id, id));
    return ok({ deleted: true });
  });
}
