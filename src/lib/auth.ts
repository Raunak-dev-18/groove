import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Groove auth.
 *
 * - Email + password (sessions for web via cookies).
 * - Bearer plugin so the Expo app can authenticate with
 *   `Authorization: Bearer <token>` instead of cookies.
 * - The FIRST user that signs up becomes the Super Admin;
 *   everyone after that is a normal user.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Rate limiting — disabled for development (tests create multiple users).
  // Re-enable with stricter limits for production deployment.
  rateLimit: {
    enabled: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh session once per day
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false, // clients can never set their own role
      },
    },
  },
  plugins: [bearer()],
  trustedOrigins: [
    // Expo Go dev server + custom origins via env (native clients send this Origin header)
    "http://localhost:8081",
    "exp://localhost:8081",
    ...(process.env.APP_ORIGINS ?? "").split(",").filter(Boolean),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          // First ever user => Super Admin. Everyone else: normal user.
          const [{ total }] = await db
            .select({ total: count() })
            .from(schema.user);
          return {
            data: {
              ...newUser,
              role: total === 0 ? "super_admin" : "user",
            },
          };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;

export const ADMIN_ROLES = ["admin", "super_admin"] as const;

/** Roles that can edit content (songs, artists) — Manager and above. */
export const EDITOR_ROLES = ["manager", "admin", "super_admin"] as const;

/** Roles that can view admin data (stats, content) — Moderator and above. */
export const VIEWER_ROLES = ["moderator", "manager", "admin", "super_admin"] as const;

/** Roles that can view the user list — Manager and above (not Moderator). */
export const USER_VIEWER_ROLES = ["manager", "admin", "super_admin"] as const;

/** All assignable roles (Super Admin can set any of these). */
export const ASSIGNABLE_ROLES = ["user", "moderator", "manager", "admin"] as const;

export function isAdmin(user?: { role: string } | null): boolean {
  return !!user && (ADMIN_ROLES as readonly string[]).includes(user.role);
}

export function isSuperAdmin(user?: { role: string } | null): boolean {
  return !!user && user.role === "super_admin";
}

export function isEditor(user?: { role: string } | null): boolean {
  return !!user && (EDITOR_ROLES as readonly string[]).includes(user.role);
}

export function isViewer(user?: { role: string } | null): boolean {
  return !!user && (VIEWER_ROLES as readonly string[]).includes(user.role);
}

export function isUserViewer(user?: { role: string } | null): boolean {
  return !!user && (USER_VIEWER_ROLES as readonly string[]).includes(user.role);
}
