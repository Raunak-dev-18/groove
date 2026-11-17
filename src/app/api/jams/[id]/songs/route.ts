import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jamSongs, jams } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { addJamSong, getJamQueue, getSongById, isJamParticipant } from "@/lib/queries";

/**
 * Shared jam playlist.
 *
 *  POST   { songId }        — any participant appends a song (the "+" button)
 *  DELETE { itemId } (body) — the adder or the host removes an entry
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { songId?: string };

    if (!body.songId) return fail("songId required", 400);
    if (!(await isJamParticipant(id, session.user.id))) return fail("You are not in this jam", 403);
    const [jam] = await db.select().from(jams).where(eq(jams.id, id)).limit(1);
    if (!jam || jam.endedAt) return fail("Jam not found", 404);

    const song = await getSongById(body.songId, session.user.id);
    if (!song) return fail("Song not found", 404);

    const current = await getJamQueue(id, session.user.id);
    if (current.length >= 200) return fail("Jam playlist is full (200)", 400);

    await addJamSong(id, song.id, session.user.id);
    return ok({ queue: await getJamQueue(id, session.user.id) }, 201);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { itemId?: string };

    if (!body.itemId) return fail("itemId required", 400);
    if (!(await isJamParticipant(id, session.user.id))) return fail("You are not in this jam", 403);
    const [jam] = await db.select().from(jams).where(eq(jams.id, id)).limit(1);
    if (!jam || jam.endedAt) return fail("Jam not found", 404);

    const [row] = await db.select().from(jamSongs).where(eq(jamSongs.id, body.itemId)).limit(1);
    if (!row || row.jamId !== id) return fail("Queue item not found", 404);

    const isHost = jam.hostId === session.user.id;
    const isAdder = row.addedById === session.user.id;
    if (!isHost && !isAdder) return fail("Only the host or whoever added it can remove it", 403);

    await db.delete(jamSongs).where(and(eq(jamSongs.id, body.itemId), eq(jamSongs.jamId, id)));
    return ok({ queue: await getJamQueue(id, session.user.id) });
  });
}
