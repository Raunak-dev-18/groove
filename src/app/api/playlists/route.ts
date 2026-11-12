import type { NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { playlists, playlistSongs, songs, user } from "@/db/schema";
import { handle, ok, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** List user's playlists with song counts. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const rows = await db
      .select({
        id: playlists.id,
        name: playlists.name,
        coverFileId: playlists.coverFileId,
        createdAt: playlists.createdAt,
        songCount: sql<number>`(select count(*)::int from ${playlistSongs} ps where ps.playlist_id = ${playlists.id})`,
      })
      .from(playlists)
      .where(eq(playlists.userId, session.user.id))
      .orderBy(desc(playlists.createdAt))
      .limit(100);
    return ok({ playlists: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
  });
}

/** Create a playlist. Body: { name } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? "").toString().trim().slice(0, 100) || "My Playlist";
    const [p] = await db
      .insert(playlists)
      .values({ userId: session.user.id, name })
      .returning();
    return ok({ playlist: { id: p.id, name: p.name, coverFileId: null, songCount: 0, createdAt: p.createdAt.toISOString() } }, 201);
  });
}
