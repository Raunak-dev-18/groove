import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { searchAll } from "@/lib/queries";

/** Search songs & artists. ?q= */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (!q) return ok({ songs: [], artists: [] });
    const result = await searchAll(q, session.user.id);
    return ok(result);
  });
}
