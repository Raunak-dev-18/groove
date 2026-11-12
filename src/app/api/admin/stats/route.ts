import type { NextRequest } from "next/server";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { artists, blends, jams, likes, plays, songs, user } from "@/db/schema";
import { handle, ok } from "@/lib/api";
import { requireContentViewer } from "@/lib/session";

/** Admin dashboard stats. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireContentViewer(req);

    const [totals, recentUsers, topSongs] = await Promise.all([
      (async () => {
        const [u] = await db.select({ c: sql<number>`count(*)::int` }).from(user);
        const [a] = await db.select({ c: sql<number>`count(*)::int` }).from(artists);
        const [s] = await db.select({ c: sql<number>`count(*)::int` }).from(songs);
        const [l] = await db.select({ c: sql<number>`count(*)::int` }).from(likes);
        const [p] = await db.select({ c: sql<number>`count(*)::int` }).from(plays);
        const [b] = await db.select({ c: sql<number>`count(*)::int` }).from(blends);
        const [j] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(jams)
          .where(isNull(jams.endedAt));
        return {
          users: u.c,
          artists: a.c,
          songs: s.c,
          likes: l.c,
          plays: p.c,
          blends: b.c,
          activeJams: j.c,
        };
      })(),
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(desc(user.createdAt))
        .limit(8),
      db
        .select({
          id: songs.id,
          title: songs.title,
          plays: songs.plays,
          artistName: artists.name,
        })
        .from(songs)
        .innerJoin(artists, eq(artists.id, songs.primaryArtistId))
        .orderBy(desc(songs.plays))
        .limit(5),
    ]);

    return ok({
      totals,
      recentUsers: recentUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
      topSongs,
    });
  });
}
