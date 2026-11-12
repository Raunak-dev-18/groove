import type { NextRequest } from "next/server";
import { clampInt, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { recommendSongs } from "@/lib/taste";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Taste-based recommendations — powers "Made for you" and autoplay radio.
 * ?limit=12&exclude=<songIds, comma-separated>
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const url = new URL(req.url);
    const limit = clampInt(url.searchParams.get("limit"), 1, 30, 12);
    const exclude = (url.searchParams.get("exclude") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => UUID_RE.test(s))
      .slice(0, 100);

    const { songs, profile } = await recommendSongs(session.user.id, limit, exclude);
    return ok({
      songs,
      taste: {
        genres: Object.keys(profile.genres).length,
        personalized: profile.signals.likes + profile.signals.plays + profile.signals.follows > 0,
      },
    });
  });
}
