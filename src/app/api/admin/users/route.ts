import type { NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { handle, ok } from "@/lib/api";
import { requireUserViewer } from "@/lib/session";

/** Admin: list users with roles. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUserViewer(req);
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(200);

    return ok({
      users: rows.map((u) => ({ ...u, image: u.image ?? null, createdAt: u.createdAt.toISOString() })),
    });
  });
}
