import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  artists,
  follows,
  likes,
  plays,
  songArtists,
  songs,
  tasteProfiles,
  user,
} from "@/db/schema";
import { attachUserFlags, listSongsShared } from "@/lib/queries";
import { cached, invalidate } from "@/lib/server-cache";
import type { SongDTO } from "@/lib/types";

/**
 * Taste profile — a small Spotify-style affinity model.
 *
 * Signals and weights:
 *   like      → +3.0 to the song's genre + primary artist (+1.5 featured)
 *   play      → +1.0 per play (capped at 5 per song; ×0.5 if last play > 14 days old)
 *   follow    → +4.0 to the artist, +2.0 to their genre
 * Like scores decay to ×0.7 when older than 30 days. Every dimension is
 * normalized to 0..1 so recommendations can combine them cleanly.
 */

const FRESH_MS = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const ONBOARDING_DAYS = 5;

export interface TasteProfile {
  genres: Record<string, number>;
  artists: Record<string, number>;
  /** per-song play counts by this user — feeds recommendation damping
   *  without an extra query at recommendation time */
  playCounts: Record<string, number>;
  signals: { likes: number; plays: number; follows: number };
  computedAt: string;
}

export interface OnboardingState {
  active: boolean;
  day: number; // 1..5
  totalDays: number;
  country: string | null;
  /** 0 → 1 over the onboarding window; how much the feed is personalized */
  ramp: number;
}

export function hasTaste(p: TasteProfile): boolean {
  return p.signals.likes + p.signals.plays + p.signals.follows > 0;
}

/**
 * The 5-day ramp: brand-new accounts get region + popularity driven
 * discovery, and personalization blends in gradually — reaching full
 * taste-based recommendations on day 5.
 */
export function onboardingState(createdAt: Date, profile: TasteProfile, country: string | null): OnboardingState {
  const days = (Date.now() - createdAt.getTime()) / DAY;
  const ramp = Math.max(0, Math.min(days / ONBOARDING_DAYS, 1));
  const active = days < ONBOARDING_DAYS || !hasTaste(profile);
  return {
    active,
    day: Math.min(Math.floor(days) + 1, ONBOARDING_DAYS),
    totalDays: ONBOARDING_DAYS,
    country,
    ramp: hasTaste(profile) ? ramp : 0,
  };
}

export async function computeProfile(userId: string): Promise<TasteProfile> {
  const now = Date.now();

  const [likeRows, playRows, followRows] = await Promise.all([
    db
      .select({
        songId: likes.songId,
        genre: songs.genre,
        primaryArtistId: songs.primaryArtistId,
        createdAt: likes.createdAt,
      })
      .from(likes)
      .innerJoin(songs, eq(songs.id, likes.songId))
      .where(eq(likes.userId, userId)),
    db
      .select({
        songId: plays.songId,
        count: sql<number>`count(*)::int`,
        last: sql<string>`max(${plays.playedAt})`,
        genre: songs.genre,
        primaryArtistId: songs.primaryArtistId,
      })
      .from(plays)
      .innerJoin(songs, eq(songs.id, plays.songId))
      .where(eq(plays.userId, userId))
      .groupBy(plays.songId, songs.genre, songs.primaryArtistId),
    db
      .select({ artistId: follows.artistId, genre: artists.genre })
      .from(follows)
      .innerJoin(artists, eq(artists.id, follows.artistId))
      .where(eq(follows.userId, userId)),
  ]);

  // featured artists for every song the user engaged with
  const engagedSongIds = [
    ...new Set([...likeRows.map((l) => l.songId), ...playRows.map((p) => p.songId)]),
  ];
  const featuredRows = engagedSongIds.length
    ? await db
        .select({ songId: songArtists.songId, artistId: songArtists.artistId })
        .from(songArtists)
        .where(inArray(songArtists.songId, engagedSongIds))
    : [];
  const featuredBy = new Map<string, string[]>();
  for (const f of featuredRows) {
    if (!featuredBy.has(f.songId)) featuredBy.set(f.songId, []);
    featuredBy.get(f.songId)!.push(f.artistId);
  }

  const genres: Record<string, number> = {};
  const artistW: Record<string, number> = {};
  const bumpGenre = (g?: string | null, w = 0) => {
    if (g && g.trim()) genres[g] = (genres[g] ?? 0) + w;
  };
  const bumpArtist = (id?: string | null, w = 0) => {
    if (id) artistW[id] = (artistW[id] ?? 0) + w;
  };

  for (const l of likeRows) {
    const w = now - l.createdAt.getTime() > 30 * DAY ? 2.1 : 3;
    bumpGenre(l.genre, w);
    bumpArtist(l.primaryArtistId, w);
    for (const fid of featuredBy.get(l.songId) ?? []) bumpArtist(fid, w * 0.5);
  }
  for (const p of playRows) {
    const recent = now - new Date(p.last).getTime() <= 14 * DAY;
    const w = Math.min(p.count, 5) * (recent ? 1 : 0.5);
    bumpGenre(p.genre, w);
    bumpArtist(p.primaryArtistId, w);
    for (const fid of featuredBy.get(p.songId) ?? []) bumpArtist(fid, w * 0.5);
  }
  for (const f of followRows) {
    bumpArtist(f.artistId, 4);
    bumpGenre(f.genre, 2);
  }

  // normalize each dimension to 0..1
  const maxG = Math.max(0, ...Object.values(genres));
  const maxA = Math.max(0, ...Object.values(artistW));
  if (maxG > 0) for (const k of Object.keys(genres)) genres[k] = genres[k] / maxG;
  if (maxA > 0) for (const k of Object.keys(artistW)) artistW[k] = artistW[k] / maxA;

  const profile: TasteProfile = {
    genres,
    artists: artistW,
    playCounts: Object.fromEntries(playRows.map((p) => [p.songId, p.count])),
    signals: {
      likes: likeRows.length,
      plays: playRows.reduce((a, p) => a + p.count, 0),
      follows: followRows.length,
    },
    computedAt: new Date().toISOString(),
  };

  await db
    .insert(tasteProfiles)
    .values({ userId, profile, computedAt: new Date() })
    .onConflictDoUpdate({
      target: tasteProfiles.userId,
      set: { profile, computedAt: new Date() },
    });
  // the fresher profile invalidates the combined user+profile memory cache
  await invalidate(`userprofile:${userId}`);

  return profile;
}

/** Cached profile; recomputed at most every 15 minutes. */
export async function getFreshProfile(userId: string): Promise<TasteProfile> {
  const [row] = await db
    .select()
    .from(tasteProfiles)
    .where(eq(tasteProfiles.userId, userId))
    .limit(1);
  if (row && Date.now() - row.computedAt.getTime() < FRESH_MS) {
    const p = row.profile as TasteProfile;
    return { ...p, playCounts: p.playCounts ?? {} };
  }
  return computeProfile(userId);
}

/** One roundtrip: user row + cached taste profile. In-memory cached 5 min. */
export async function getUserWithProfile(
  userId: string,
): Promise<{ createdAt: Date; country: string | null; profile: TasteProfile }> {
  return cached(`userprofile:${userId}`, 5 * 60 * 1000, async () => {
    const [row] = await db
      .select({
        createdAt: user.createdAt,
        country: user.country,
        profile: tasteProfiles.profile,
        computedAt: tasteProfiles.computedAt,
      })
      .from(user)
      .leftJoin(tasteProfiles, eq(tasteProfiles.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);

    const fresh =
      row?.profile && row.computedAt && Date.now() - row.computedAt.getTime() < FRESH_MS
        ? ({ ...(row.profile as TasteProfile), playCounts: (row.profile as TasteProfile).playCounts ?? {} } as TasteProfile)
        : await computeProfile(userId);

    return {
      createdAt: row?.createdAt ?? new Date(),
      country: row?.country ?? null,
      profile: fresh,
    };
  });
}

/**
 * Recommendations — score every song against the profile, then weighted-sample
 * without replacement (Spotify-radio style, so it's fresh every session).
 *
 *   score = 1
 *         + ramp × (3 × genre affinity + 3 × artist affinity + featured)   ← taste
 *         + regionBoost                                                   ← onboarding discovery
 *         + 0.3 × log10(1 + global plays)                                 ← popularity
 *
 * The ramp (0 → 1 over the first 5 days, see onboardingState) starts new
 * accounts on region/popularity discovery and blends their real taste in
 * gradually. Discovery damping keeps songs you overplay from dominating
 * (×0.7 if played, ×0.35 if played 3+ times), and no artist gets more than
 * 2 picks before everyone else is sampled.
 */
export async function recommendSongs(
  userId: string,
  limit: number,
  excludeIds: string[],
): Promise<{ songs: SongDTO[]; profile: TasteProfile }> {
  const { createdAt, country, profile } = await getUserWithProfile(userId);
  const ob = onboardingState(createdAt, profile, country);
  const songs = await recommendWithProfile(userId, profile, ob, limit, excludeIds);
  return { songs, profile };
}

/** Core scorer — home calls this with a shared profile/onboarding state. */
export async function recommendWithProfile(
  userId: string,
  profile: TasteProfile,
  ob: OnboardingState,
  limit: number,
  excludeIds: string[],
): Promise<SongDTO[]> {
  // cached shared candidate list (30s TTL) — per-user flags attached after
  const candidates = await listSongsShared({ sort: "popular", limit: 400 });
  const flagged = await attachUserFlags(userId, candidates);
  const playCounts = profile.playCounts ?? {};

  const excl = new Set(excludeIds);
  const taste = hasTaste(profile);
  const scored = flagged
    .filter((s) => !excl.has(s.id))
    .map((s) => {
      let score = 1;
      if (taste) {
        const personal =
          3 * (profile.genres[s.genre] ?? 0) +
          3 * (profile.artists[s.primaryArtist.id] ?? 0) +
          (s.artists.length > 0
            ? s.artists.reduce((a, x) => a + (profile.artists[x.id] ?? 0), 0) / s.artists.length
            : 0);
        score += ob.ramp * personal;
      }
      // region boost: strong while onboarding, gentle afterwards
      if (ob.country && s.primaryArtist.country && s.primaryArtist.country === ob.country) {
        score += ob.active ? 2.5 : 0.5;
      }
      score += 0.3 * Math.log10(1 + s.plays);
      const mine = playCounts[s.id] ?? 0;
      if (mine >= 3) score *= 0.35;
      else if (mine > 0) score *= 0.7;
      return { song: s, score: Math.max(0.01, score) };
    });

  // weighted sampling without replacement, max 2 per artist (capped items
  // are deferred, not dropped — they re-enter via the fill phase below)
  const PER_ARTIST = 2;
  const artistCount: Record<string, number> = {};
  const avail = [...scored];
  const deferred: { song: SongDTO; score: number }[] = [];
  const picked: { song: SongDTO; score: number }[] = [];
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
  // fill any remaining slots best-score-first from deferred + leftovers
  const fillPool = [...deferred, ...avail].sort((a, b) => b.score - a.score);
  for (const rest of fillPool) {
    if (picked.length >= limit) break;
    picked.push(rest);
  }

  return picked.map((p) => p.song);
}

/** Top genres + artists for UI chips (from a precomputed profile — no recompute). */
export async function tasteSummaryFromProfile(profile: TasteProfile) {
  const topGenres = Object.entries(profile.genres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, score]) => ({ name, score: Math.round(score * 100) }));
  const artistIds = Object.entries(profile.artists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  const topArtists = artistIds.length
    ? await db
        .select({ id: artists.id, name: artists.name })
        .from(artists)
        .where(inArray(artists.id, artistIds))
    : [];
  const order = new Map(artistIds.map((id, i) => [id, i]));
  return {
    genres: topGenres,
    artists: topArtists.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    signals: profile.signals,
    updatedAt: profile.computedAt,
  };
}

/** Top genres + artists for UI chips. */
export async function tasteSummary(userId: string) {
  const profile = await getFreshProfile(userId);
  return tasteSummaryFromProfile(profile);
}
