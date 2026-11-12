import type { NextRequest } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blendMembers, blends, jamParticipants, jams, likes, user } from "@/db/schema";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { listArtists, listSongs } from "@/lib/queries";

/** Library: liked songs, following artists, my blends, my jams. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const uid = session.user.id;

    const [likedIds, memberBlendIds, myJams] = await Promise.all([
      db
        .select({ songId: likes.songId })
        .from(likes)
        .where(eq(likes.userId, uid))
        .orderBy(desc(likes.createdAt))
        .limit(100),
      db
        .select({ blendId: blendMembers.blendId })
        .from(blendMembers)
        .where(eq(blendMembers.userId, uid))
        .limit(50),
      db
        .selectDistinct({
          id: jams.id,
          name: jams.name,
          code: jams.code,
          hostId: jams.hostId,
          isPlaying: jams.isPlaying,
          updatedAt: jams.updatedAt,
        })
        .from(jams)
        .innerJoin(jamParticipants, eq(jamParticipants.jamId, jams.id))
        .where(eq(jamParticipants.userId, uid))
        .limit(50),
    ]);

    const blendIds = memberBlendIds.map((m) => m.blendId);
    const [likedSongs, followingArtists, myBlends] = await Promise.all([
      listSongs({ ids: likedIds.map((l) => l.songId), limit: 100, currentUserId: uid }),
      listArtists({ followedBy: uid, limit: 50 }),
      blendIds.length
        ? db
            .select({
              id: blends.id,
              name: blends.name,
              code: blends.code,
              ownerId: blends.ownerId,
              ownerName: user.name,
              createdAt: blends.createdAt,
            })
            .from(blends)
            .innerJoin(user, eq(user.id, blends.ownerId))
            .where(inArray(blends.id, blendIds))
            .limit(50)
        : Promise.resolve([]),
    ]);

    return ok({
      likedSongs: likedSongs.rows,
      followingArtists: followingArtists.rows,
      blends: myBlends.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
      jams: myJams.map((j) => ({ ...j, updatedAt: j.updatedAt.toISOString() })),
    });
  });
}
