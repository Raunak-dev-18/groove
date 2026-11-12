import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import type { Role } from "@/lib/types";

/** Current user + role (drives role-based navigation on both clients). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    return ok({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
        role: (session.user as { role?: string }).role as Role,
      },
    });
  });
}
