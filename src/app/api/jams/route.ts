import type { NextRequest } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jamParticipants, jams, user } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { genCode } from "@/lib/utils";

/** My active jams (hosting or participating). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const uid = session.user.id;

    const myJams = await db
      .selectDistinct({
        id: jams.id,
        name: jams.name,
        code: jams.code,
        hostId: jams.hostId,
        hostName: user.name,
        isPlaying: jams.isPlaying,
        updatedAt: jams.updatedAt,
      })
      .from(jams)
      .innerJoin(jamParticipants, eq(jamParticipants.jamId, jams.id))
      .innerJoin(user, eq(user.id, jams.hostId))
      .where(eq(jamParticipants.userId, uid))
      .orderBy(desc(jams.updatedAt))
      .limit(50);

    return ok({
      jams: myJams.map((j) => ({ ...j, updatedAt: j.updatedAt.toISOString() })),
    });
  });
}

/** Create a jam (you become the host). Body: { name } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? "").toString().trim() || `${session.user.name}'s Jam`;

    const [jam] = await db
      .insert(jams)
      .values({ name, hostId: session.user.id, code: genCode() })
      .returning();

    await db.insert(jamParticipants).values({ jamId: jam.id, userId: session.user.id });

    return ok(
      {
        jam: {
          id: jam.id,
          name: jam.name,
          code: jam.code,
          hostId: jam.hostId,
          isPlaying: jam.isPlaying,
          positionSec: 0,
        },
      },
      201,
    );
  });
}
