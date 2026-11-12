import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { blendMembers, blends } from "@/db/schema";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Leave a blend. Owner leaving deletes it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;

    const [blend] = await db.select().from(blends).where(eq(blends.id, id)).limit(1);
    if (!blend) return ok({ left: true });

    await db
      .delete(blendMembers)
      .where(and(eq(blendMembers.blendId, id), eq(blendMembers.userId, session.user.id)));

    if (blend.ownerId === session.user.id) {
      await db.delete(blends).where(eq(blends.id, id));
      return ok({ left: true, deleted: true });
    }
    return ok({ left: true });
  });
}
