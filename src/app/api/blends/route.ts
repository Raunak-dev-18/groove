import type { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blendMembers, blends, user } from "@/db/schema";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { blendTasteMatch } from "@/lib/queries";
import { genCode } from "@/lib/utils";

/** My blends (where I'm a member). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const uid = session.user.id;

    const memberRows = await db
      .select({ blendId: blendMembers.blendId })
      .from(blendMembers)
      .where(eq(blendMembers.userId, uid))
      .limit(50);

    const ids = memberRows.map((m) => m.blendId);
    const rows = ids.length
      ? await db
          .select({
            id: blends.id,
            name: blends.name,
            code: blends.code,
            ownerId: blends.ownerId,
            ownerName: user.name,
            createdAt: blends.createdAt,
          })
          .from(blends)
          .innerJoin(user, eq(user.id, blends.ownerId))
          .where(inArray(blends.id, ids))
          .orderBy(blends.createdAt)
          .limit(50)
      : [];

    return ok({
      blends: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    });
  });
}

/** Create a blend. Body: { name } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? "").toString().trim() || "Our Blend";

    const [blend] = await db
      .insert(blends)
      .values({ name, ownerId: session.user.id, code: genCode() })
      .returning();

    await db.insert(blendMembers).values({ blendId: blend.id, userId: session.user.id });

    return ok(
      {
        blend: {
          id: blend.id,
          name: blend.name,
          code: blend.code,
          ownerId: blend.ownerId,
          ownerName: session.user.name,
          createdAt: blend.createdAt.toISOString(),
        },
      },
      201,
    );
  });
}
