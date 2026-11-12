import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jamParticipants, jams, user } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getJamMessages, getSongById, isJamParticipant } from "@/lib/queries";
import type { JamStateDTO } from "@/lib/types";

/**
 * Jam state poll — the heart of jam sync.
 * Returns the current song, server-computed playhead (positionNow),
 * participants, and any chat messages after ?msgAfter=<ISO>.
 * Clients (web + mobile) poll this every ~2s and sync their player.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const msgAfter = new URL(req.url).searchParams.get("msgAfter");

    if (!(await isJamParticipant(id, session.user.id))) {
      return fail("You are not in this jam", 403);
    }

    const [jam] = await db.select().from(jams).where(eq(jams.id, id)).limit(1);
    if (!jam || jam.endedAt) return fail("Jam not found", 404);

    const [participants, host, messages, currentSong] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          image: user.image,
          joinedAt: jamParticipants.joinedAt,
        })
        .from(jamParticipants)
        .innerJoin(user, eq(user.id, jamParticipants.userId))
        .where(eq(jamParticipants.jamId, id)),
      db
        .select({ id: user.id, name: user.name, image: user.image })
        .from(user)
        .where(eq(user.id, jam.hostId))
        .limit(1),
      getJamMessages(id, msgAfter, msgAfter ? 100 : 50),
      jam.currentSongId
        ? getSongById(jam.currentSongId, session.user.id)
        : Promise.resolve(null),
    ]);

    const now = Date.now();
    let positionNow = jam.positionSec;
    if (jam.isPlaying && jam.updatedAt) {
      positionNow = jam.positionSec + (now - jam.updatedAt.getTime()) / 1000;
      if (currentSong && currentSong.durationSec > 0) {
        positionNow = Math.min(positionNow, currentSong.durationSec);
      }
    }

    const state: JamStateDTO = {
      id: jam.id,
      name: jam.name,
      code: jam.code,
      hostId: jam.hostId,
      isPlaying: jam.isPlaying,
      positionSec: jam.positionSec,
      positionNow,
      updatedAt: jam.updatedAt.toISOString(),
      serverTime: new Date(now).toISOString(),
      currentSong,
      host: host[0] ?? { id: jam.hostId, name: "Host", image: null },
      participants: participants.map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image ?? null,
        isHost: p.id === jam.hostId,
      })),
    };

    return ok({ jam: state, messages });
  });
}

/** Host: end the jam. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const [jam] = await db.select().from(jams).where(eq(jams.id, id)).limit(1);
    if (!jam) return fail("Jam not found", 404);
    if (jam.hostId !== session.user.id) return fail("Only the host can end this jam", 403);
    await db.update(jams).set({ endedAt: new Date(), isPlaying: false }).where(eq(jams.id, id));
    return ok({ ended: true });
  });
}
