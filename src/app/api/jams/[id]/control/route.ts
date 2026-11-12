import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jams } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getSongById, isJamParticipant } from "@/lib/queries";

/**
 * Host playback control — the host is the source of truth for the jam.
 * Body: { songId?: string, isPlaying: boolean, positionSec?: number }
 * The server stores position + timestamp; participants compute drift
 * from positionNow on the next poll.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const [jam] = await db.select().from(jams).where(eq(jams.id, id)).limit(1);
    if (!jam || jam.endedAt) return fail("Jam not found", 404);
    if (!(await isJamParticipant(id, session.user.id))) return fail("You are not in this jam", 403);
    if (jam.hostId !== session.user.id) return fail("Only the host controls playback", 403);

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.songId === "string" && body.songId && body.songId !== jam.currentSongId) {
      const song = await getSongById(body.songId, session.user.id);
      if (!song) return fail("Song not found", 404);
      patch.currentSongId = song.id;
      patch.positionSec = 0;
    }
    if (typeof body.isPlaying === "boolean") {
      patch.isPlaying = body.isPlaying;
    }
    if (Number.isFinite(Number(body.positionSec)) && Number(body.positionSec) >= 0) {
      // position is only trusted when it comes with an explicit isPlaying
      if (typeof body.isPlaying !== "boolean") {
        return fail("positionSec must be sent together with isPlaying", 400);
      }
      if (body.songId === undefined) patch.positionSec = Number(body.positionSec);
    }

    await db.update(jams).set(patch).where(eq(jams.id, id));
    return ok({ ok: true });
  });
}
