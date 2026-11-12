import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { jamParticipants, jams } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Join a jam with its 6-char invite code. Body: { code } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const code = (body.code ?? "").toString().trim().toUpperCase();
    if (!code) return fail("Invite code required", 400);

    const [jam] = await db
      .select()
      .from(jams)
      .where(and(eq(jams.code, code), isNull(jams.endedAt)))
      .limit(1);
    if (!jam) return fail("Jam not found for that code", 404);

    await db
      .insert(jamParticipants)
      .values({ jamId: jam.id, userId: session.user.id })
      .onConflictDoNothing();

    return ok({ jam: { id: jam.id, name: jam.name, code: jam.code, hostId: jam.hostId } });
  });
}
