import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jamParticipants, jams } from "@/db/schema";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Leave a jam. Hosts leaving ends the jam. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;

    const [jam] = await db.select().from(jams).where(eq(jams.id, id)).limit(1);
    if (!jam) return ok({ left: true });

    await db
      .delete(jamParticipants)
      .where(and(eq(jamParticipants.jamId, id), eq(jamParticipants.userId, session.user.id)));

    if (jam.hostId === session.user.id) {
      await db.update(jams).set({ endedAt: new Date(), isPlaying: false }).where(eq(jams.id, id));
      return ok({ left: true, ended: true });
    }
    return ok({ left: true });
  });
}
