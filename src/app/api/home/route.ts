import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { countryFromRequest } from "@/lib/geo";
import {
  discoverArtistsByRegion,
  featuredForSongs,
  followingArtistsRaw,
  likedSongIds,
  listSongsShared,
  recentPlaysRaw,
} from "@/lib/queries";
import {
  getUserWithProfile,
  onboardingState,
  recommendWithProfile,
  tasteSummaryFromProfile,
} from "@/lib/taste";
import type { SongDTO } from "@/lib/types";

/**
 * Consolidated home feed — ONE request for everything, built for high-RTT
 * databases: shared lists come from the in-memory TTL cache, user-specific
 * data is fetched in parallel batches, and per-user flags are stamped from
 * a single bulk likes query.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const uid = session.user.id;
    const headerCountry = countryFromRequest(req);

    // shared, cached lists — zero DB roundtrips when warm
    const [trendingCore, newCore, candidates] = await Promise.all([
      listSongsShared({ sort: "popular", limit: 10 }),
      listSongsShared({ sort: "new", limit: 10 }),
      listSongsShared({ sort: "popular", limit: 400 }),
    ]);

    // parallel batch 1: user+profile (cached), recent plays, following artists
    const [{ createdAt, country, profile }, recentPlays, followingArtists] = await Promise.all([
      getUserWithProfile(uid),
      recentPlaysRaw(uid, 10),
      followingArtistsRaw(uid, 10),
    ]);

    // capture country once — one conditional write, only if still unknown
    if (headerCountry && !country) {
      await db
        .update(user)
        .set({ country: headerCountry })
        .where(and(eq(user.id, uid), isNull(user.country)));
    }

    const ob = onboardingState(createdAt, profile, country ?? headerCountry);

    // parallel batch 2: bulk likes for ALL payload songs + featured artists
    const allIds = [
      ...new Set([
        ...trendingCore.map((s) => s.id),
        ...newCore.map((s) => s.id),
        ...recentPlays.map((s) => s.id),
        ...candidates.map((s) => s.id),
      ]),
    ];
    const [likedSet, feats] = await Promise.all([
      likedSongIds(uid, allIds),
      featuredForSongs(recentPlays.map((s) => s.id)),
    ]);

    const stamp = (s: SongDTO): SongDTO => ({
      ...s,
      liked: likedSet.has(s.id),
      artists: [
        s.artists[0],
        ...(feats.get(s.id)?.filter((f) => f.id !== s.artists[0].id).map((f) => ({ ...f, role: "featured" as const })) ?? []),
      ].filter(Boolean),
    });

    // recommendations use the same shared candidates + bulk likes — no extra queries
    const forYou = await recommendFromCandidates(uid, profile, ob, 10, [], candidates, likedSet);

    const taste = await tasteSummaryFromProfile(profile);

    return ok({
      trending: trendingCore.map(stamp),
      newReleases: newCore.map(stamp),
      recentPlays: recentPlays.map(stamp),
      followingArtists,
      forYou,
      taste,
      onboarding: ob,
      discoverArtists: ob.active
        ? await discoverArtistsByRegion(country ?? headerCountry, uid, 10)
        : [],
    });
  });
}

/** Score + sample from pre-fetched candidates (no extra DB work). */
async function recommendFromCandidates(
  userId: string,
  profile: import("@/lib/taste").TasteProfile,
  ob: import("@/lib/taste").OnboardingState,
  limit: number,
  excludeIds: string[],
  candidates: SongDTO[],
  likedSet: Set<string>,
): Promise<SongDTO[]> {
  const excl = new Set(excludeIds);
  const playCounts = profile.playCounts ?? {};
  const scored = candidates
    .filter((s) => !excl.has(s.id))
    .map((s) => {
      let score = 1;
      const taste = profile.signals.likes + profile.signals.plays + profile.signals.follows > 0;
      if (taste) {
        const personal =
          3 * (profile.genres[s.genre] ?? 0) +
          3 * (profile.artists[s.primaryArtist.id] ?? 0) +
          (s.artists.length > 0
            ? s.artists.reduce((a, x) => a + (profile.artists[x.id] ?? 0), 0) / s.artists.length
            : 0);
        score += ob.ramp * personal;
      }
      if (ob.country && s.primaryArtist.country && s.primaryArtist.country === ob.country) {
        score += ob.active ? 2.5 : 0.5;
      }
      score += 0.3 * Math.log10(1 + s.plays);
      const mine = playCounts[s.id] ?? 0;
      if (mine >= 3) score *= 0.35;
      else if (mine > 0) score *= 0.7;
      return { song: { ...s, liked: likedSet.has(s.id) }, score: Math.max(0.01, score) };
    });

  // weighted sampling without replacement, max 2 per artist upfront
  const PER_ARTIST = 2;
  const artistCount: Record<string, number> = {};
  const avail = [...scored];
  const deferred: typeof scored = [];
  const picked: typeof scored = [];
  while (picked.length < limit && avail.length > 0) {
    const total = avail.reduce((a, x) => a + x.score, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < avail.length; idx++) {
      r -= avail[idx].score;
      if (r <= 0) break;
    }
    idx = Math.min(idx, avail.length - 1);
    const item = avail.splice(idx, 1)[0];
    const aid = item.song.primaryArtist.id;
    if ((artistCount[aid] ?? 0) >= PER_ARTIST) {
      deferred.push(item);
      continue;
    }
    artistCount[aid] = (artistCount[aid] ?? 0) + 1;
    picked.push(item);
  }
  const fillPool = [...deferred, ...avail].sort((a, b) => b.score - a.score);
  for (const rest of fillPool) {
    if (picked.length >= limit) break;
    picked.push(rest);
  }
  return picked.map((p) => p.song);
}
