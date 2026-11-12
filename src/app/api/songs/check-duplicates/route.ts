import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { requireContentEditor } from "@/lib/session";
import { findDuplicates } from "@/lib/duplicate-server";

/**
 * POST /api/songs/check-duplicates
 * Body:   { songs: [{ title, artist }] }
 * Output: { duplicates: [{ index, existing: { id, title, artist } }] }
 *
 * Batch pre-check for the bulk upload queue — flags which queued songs
 * already exist in the library (matched by normalized title + artist).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireContentEditor(req);
    const body = await req.json();
    const items = Array.isArray(body?.songs) ? body.songs : [];
    if (items.length === 0) return ok({ duplicates: [] });
    if (items.length > 500) return fail("Too many items (max 500)", 400);

    const candidates = items.map((it: { title?: unknown; artist?: unknown }) => ({
      title: typeof it?.title === "string" ? it.title : "",
      artist: typeof it?.artist === "string" ? it.artist : "",
    }));

    const matches = await findDuplicates(candidates);
    const duplicates = matches
      .map((existing, index) => (existing ? { index, existing } : null))
      .filter((x): x is { index: number; existing: NonNullable<typeof x>["existing"] } => x !== null);

    return ok({ duplicates });
  });
}
