import type { NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { playlists, playlistSongs, user } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { listSongs } from "@/lib/queries";

/** Playlist detail — songs + owner. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;

    const [p] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!p) return fail("Playlist not found", 404);
    if (p.userId !== session.user.id) return fail("Not your playlist", 403);

    const rows = await db
      .select({ songId: playlistSongs.songId })
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, id))
      .orderBy(desc(playlistSongs.addedAt))
      .limit(500);

    const ids = rows.map((r) => r.songId);
    const { rows: songs } = ids.length
      ? await listSongs({ ids, limit: 500, currentUserId: session.user.id })
      : { rows: [] };

    const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, p.userId)).limit(1);

    return ok({
      playlist: {
        id: p.id,
        name: p.name,
        coverFileId: p.coverFileId,
        createdAt: p.createdAt.toISOString(),
        ownerName: owner?.name ?? "You",
        songs,
      },
    });
  });
}

/** Rename playlist. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const [p] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!p) return fail("Playlist not found", 404);
    if (p.userId !== session.user.id) return fail("Not your playlist", 403);

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 100);
    if (typeof body.coverFileId === "string") patch.coverFileId = body.coverFileId;

    if (Object.keys(patch).length) {
      await db.update(playlists).set(patch).where(eq(playlists.id, id));
    }
    return ok({ updated: true });
  });
}

/** Delete playlist. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const [p] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!p) return fail("Playlist not found", 404);
    if (p.userId !== session.user.id) return fail("Not your playlist", 403);
    await db.delete(playlists).where(eq(playlists.id, id));
    return ok({ deleted: true });
  });
}
