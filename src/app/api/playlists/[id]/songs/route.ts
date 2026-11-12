import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { playlists, playlistSongs, songs } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Add a song to playlist. Body: { songId } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const songId = (body.songId ?? "").toString();
    if (!songId) return fail("Song required", 400);

    const [p] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!p) return fail("Playlist not found", 404);
    if (p.userId !== session.user.id) return fail("Not your playlist", 403);

    const [s] = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, songId)).limit(1);
    if (!s) return fail("Song not found", 404);

    await db.insert(playlistSongs).values({ playlistId: id, songId }).onConflictDoNothing();
    return ok({ added: true }, 201);
  });
}

/** Remove song from playlist. ?songId= */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const songId = new URL(req.url).searchParams.get("songId") ?? "";
    if (!songId) return fail("Song required", 400);

    const [p] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!p) return fail("Playlist not found", 404);
    if (p.userId !== session.user.id) return fail("Not your playlist", 403);

    await db
      .delete(playlistSongs)
      .where(and(eq(playlistSongs.playlistId, id), eq(playlistSongs.songId, songId)));
    return ok({ removed: true });
  });
}
