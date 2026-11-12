import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { fail, handle, ok } from "@/lib/api";
import { requireSuperAdmin, requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth";

/** Roles that Admin (non-super) can assign */
const ADMIN_ASSIGNABLE = ["user", "admin"];
/** Roles that Super Admin can assign */
const SUPER_ASSIGNABLE = ["user", "moderator", "manager", "admin"];

/**
 * Change a user's role.
 *  - Admin can set: "user" ↔ "admin"
 *  - Super Admin can set: "user", "moderator", "manager", "admin"
 *  - Nobody can modify super_admins or change their own role.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const role = (body.role ?? "").toString();

    const requesterRole = (session.user as { role?: string }).role ?? "user";
    const isSuper = requesterRole === "super_admin";
    const isAdminUser = requesterRole === "admin" || isSuper;

    if (!isAdminUser) return fail("Admin access required", 403);
    if (role === "super_admin") return fail("Cannot assign Super Admin role", 400);

    const assignable = isSuper ? SUPER_ASSIGNABLE : ADMIN_ASSIGNABLE;
    if (!assignable.includes(role)) {
      return fail(
        isSuper
          ? `Role must be one of: ${SUPER_ASSIGNABLE.join(", ")}`
          : `Admins can only set roles: ${ADMIN_ASSIGNABLE.join(", ")}. Ask a Super Admin for Manager/Moderator roles.`,
        400,
      );
    }

    if (id === session.user.id) return fail("You cannot change your own role", 400);

    const [target] = await db.select().from(user).where(eq(user.id, id)).limit(1);
    if (!target) return fail("User not found", 404);
    if (target.role === "super_admin") return fail("Super admins cannot be modified", 400);

    await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
    return ok({ id, role });
  });
}
