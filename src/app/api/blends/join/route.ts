import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blendMembers, blends } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** Join a blend with its invite code. Body: { code } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const code = (body.code ?? "").toString().trim().toUpperCase();
    if (!code) return fail("Invite code required", 400);

    const [blend] = await db.select().from(blends).where(eq(blends.code, code)).limit(1);
    if (!blend) return fail("Blend not found for that code", 404);

    await db
      .insert(blendMembers)
      .values({ blendId: blend.id, userId: session.user.id })
      .onConflictDoNothing();

    return ok({ blend: { id: blend.id, name: blend.name, code: blend.code, ownerId: blend.ownerId } });
  });
}
