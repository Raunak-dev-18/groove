import type { NextRequest } from "next/server";
import { auth, isAdmin, isEditor, isSuperAdmin, isUserViewer, isViewer, type Session } from "@/lib/auth";
import { cached } from "@/lib/server-cache";

/** Session token from cookie (web) or Authorization header (mobile). */
function sessionToken(req: NextRequest): string | null {
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice(7);
  const cookie = req.headers.get("cookie") ?? "";
  const m = /better-auth\.session_token=([^;]+)/.exec(cookie);
  return m?.[1] ?? null;
}

const SESSION_TTL_MS = 30 * 1000; // short window — revocation (sign-out) lands within 30s

/** Get the session from an API request (works with cookies AND bearer tokens).
 *  Resolved sessions are cached briefly by token — the auth check otherwise
 *  costs 2-3 serial DB roundtrips on every single API call. */
export async function getApiSession(req: NextRequest): Promise<Session | null> {
  const token = sessionToken(req);
  if (!token) return auth.api.getSession({ headers: req.headers });
  return cached(`session:${token}`, SESSION_TTL_MS, () =>
    auth.api.getSession({ headers: req.headers }),
  );
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Throws 401 unless a user is signed in. */
export async function requireUser(req: NextRequest): Promise<Session> {
  const session = await getApiSession(req);
  if (!session?.user) throw new ApiError("Sign in required", 401);
  return session;
}

/** Throws 403 unless the user can EDIT content (Manager+). */
export async function requireContentEditor(req: NextRequest): Promise<Session> {
  const session = await requireUser(req);
  if (!isEditor(session.user)) throw new ApiError("Editor access required", 403);
  return session;
}

/** Throws 403 unless the user can VIEW admin data (Moderator+). */
export async function requireContentViewer(req: NextRequest): Promise<Session> {
  const session = await requireUser(req);
  if (!isViewer(session.user)) throw new ApiError("Moderator access required", 403);
  return session;
}

/** Throws 403 unless the user can VIEW users (Manager+, not Moderator). */
export async function requireUserViewer(req: NextRequest): Promise<Session> {
  const session = await requireUser(req);
  if (!isUserViewer(session.user)) throw new ApiError("Manager access required", 403);
  return session;
}

/** Throws 403 unless the user is an admin or super admin. */
export async function requireAdmin(req: NextRequest): Promise<Session> {
  const session = await requireUser(req);
  if (!isAdmin(session.user)) throw new ApiError("Admin access required", 403);
  return session;
}

/** Throws 403 unless the user is THE super admin. */
export async function requireSuperAdmin(req: NextRequest): Promise<Session> {
  const session = await requireUser(req);
  if (!isSuperAdmin(session.user)) throw new ApiError("Super admin access required", 403);
  return session;
}
