import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays, songs } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Record a play (called once when a song starts). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;

    const song = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, id)).limit(1);
    if (song.length === 0) return fail("Song not found", 404);

    await db.insert(plays).values({ userId: session.user.id, songId: id });
    const [updated] = await db
      .update(songs)
      .set({ plays: sql`${songs.plays} + 1` })
      .where(eq(songs.id, id))
      .returning({ plays: songs.plays });

    return ok({ plays: updated.plays });
  });
}
