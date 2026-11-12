import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  artists,
  blendMembers,
  blendSongs,
  blends,
  follows,
  jamMessages,
  jamParticipants,
  jams,
  likes,
  plays,
  songArtists,
  songs,
  user,
} from "@/db/schema";
import { cached } from "@/lib/server-cache";
import type { ArtistDTO, SongDTO } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Songs                                                               */
/* ------------------------------------------------------------------ */

interface ListSongsOpts {
  limit?: number;
  offset?: number;
  sort?: "new" | "popular" | "title";
  artistId?: string;
  ids?: string[];
  currentUserId?: string | null;
}

const likedExpr = (userId?: string | null) =>
  userId
    ? exists(
        db
          .select({ x: sql`1` })
          .from(likes)
          .where(and(eq(likes.songId, songs.id), eq(likes.userId, userId))),
      )
    : sql<boolean>`false`;

/** Stamp per-user liked flags onto shared (cached) song rows — one query. */
export async function attachUserFlags(userId: string | null | undefined, rows: SongDTO[]): Promise<SongDTO[]> {
  if (!userId || rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const likedRows = await db
    .select({ songId: likes.songId })
    .from(likes)
    .where(and(eq(likes.userId, userId), inArray(likes.songId, ids)));
  const likedSet = new Set(likedRows.map((r) => r.songId));
  return rows.map((r) => ({ ...r, liked: likedSet.has(r.id) }));
}

/**
 * Cached, shared song lists (liked=false) — the hot path for trending /
 * recommendation candidates. Per-user flags are attached afterwards with
 * attachUserFlags, so the cache stays universal across users.
 */
export async function listSongsShared(opts: {
  sort?: "new" | "popular" | "title";
  limit?: number;
  artistId?: string;
}): Promise<SongDTO[]> {
  const { sort = "popular", limit = 20, artistId } = opts;
  const key = `songs:${sort}:${limit}:${artistId ?? "-"}`;
  return cached(key, 30_000, async () => {
    const { rows } = await listSongs({ sort, limit, artistId, currentUserId: null });
    return rows.map((r) => ({ ...r, liked: false }));
  });
}

/** Build SongDTO rows with primary artist + featured artists + liked flag. */
export async function listSongs(opts: ListSongsOpts): Promise<{ rows: SongDTO[]; total: number }> {
  const { limit = 20, offset = 0, sort = "new", artistId, ids, currentUserId } = opts;

  const conditions = [];
  if (artistId) {
    conditions.push(
      or(
        eq(songs.primaryArtistId, artistId),
        exists(
          db
            .select({ x: sql`1` })
            .from(songArtists)
            .where(and(eq(songArtists.songId, songs.id), eq(songArtists.artistId, artistId))),
        ),
      ),
    );
  }
  if (ids) {
    if (ids.length === 0) return { rows: [], total: 0 };
    conditions.push(inArray(songs.id, ids));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const order =
    sort === "popular" ? desc(songs.plays) : sort === "title" ? asc(songs.title) : desc(songs.createdAt);

  const [baseRows, totalRow] = await Promise.all([
    db
      .select({
        id: songs.id,
        title: songs.title,
        description: songs.description,
        audioFileId: songs.audioFileId,
        coverFileId: songs.coverFileId,
        durationSec: songs.durationSec,
        genre: songs.genre,
        plays: songs.plays,
        createdAt: songs.createdAt,
        // artist may be unbound (deleted artist → SET NULL) — songs stay visible
        artistId: sql<string>`coalesce(${artists.id}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        artistName: sql<string>`coalesce(${artists.name}, 'Unknown Artist')`,
        artistAvatar: artists.avatarFileId,
        artistCountry: artists.country,
        liked: likedExpr(currentUserId),
      })
      .from(songs)
      .leftJoin(artists, eq(artists.id, songs.primaryArtistId))
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(songs)
      .where(where),
  ]);

  const total = totalRow[0]?.total ?? 0;
  if (baseRows.length === 0) return { rows: [], total };

  // featured artists for the returned songs
  const songIds = baseRows.map((r) => r.id);
  const feats = await db
    .select({
      songId: songArtists.songId,
      artistId: songArtists.artistId,
      name: artists.name,
      avatarFileId: artists.avatarFileId,
      role: songArtists.role,
    })
    .from(songArtists)
    .innerJoin(artists, eq(artists.id, songArtists.artistId))
    .where(inArray(songArtists.songId, songIds));

  const rows: SongDTO[] = baseRows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    audioFileId: r.audioFileId,
    coverFileId: r.coverFileId,
    durationSec: r.durationSec,
    genre: r.genre,
    plays: r.plays,
    createdAt: r.createdAt.toISOString(),
    primaryArtist: {
      id: r.artistId,
      name: r.artistName,
      avatarFileId: r.artistAvatar,
      country: r.artistCountry,
    },
    artists: [
      { id: r.artistId, name: r.artistName, role: "primary" as const },
      ...feats
        .filter((f) => f.songId === r.id && f.artistId !== r.artistId)
        .map((f) => ({ id: f.artistId, name: f.name, avatarFileId: f.avatarFileId, role: "featured" as const })),
    ],
    liked: Boolean(r.liked),
  }));

  return { rows, total };
}

export async function getSongById(id: string, currentUserId?: string | null): Promise<SongDTO | null> {
  const { rows } = await listSongs({ ids: [id], limit: 1, currentUserId });
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Artists                                                             */
/* ------------------------------------------------------------------ */

interface ListArtistsOpts {
  limit?: number;
  offset?: number;
  ids?: string[];
  followedBy?: string | null;
  withCounts?: boolean;
}

export async function listArtists(opts: ListArtistsOpts = {}): Promise<{ rows: ArtistDTO[]; total: number }> {
  const { limit = 20, offset = 0, ids, followedBy, withCounts = true } = opts;
  const conditions = [];
  if (ids) {
    if (ids.length === 0) return { rows: [], total: 0 };
    conditions.push(inArray(artists.id, ids));
  }
  if (followedBy) {
    conditions.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(follows)
          .where(and(eq(follows.artistId, artists.id), eq(follows.userId, followedBy))),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const base = db
    .select({
      id: artists.id,
      name: artists.name,
      bio: artists.bio,
      genre: artists.genre,
      country: artists.country,
      avatarFileId: artists.avatarFileId,
      createdAt: artists.createdAt,
    })
    .from(artists)
    .where(where)
    .orderBy(desc(artists.createdAt))
    .limit(limit)
    .offset(offset);

  const countQ = db.select({ total: sql<number>`count(*)::int` }).from(artists).where(where);

  let rows;
  let totalRow;
  if (withCounts && followedBy) {
    [rows, totalRow] = await Promise.all([
      db
        .select({
          id: artists.id,
          name: artists.name,
          bio: artists.bio,
          genre: artists.genre,
          country: artists.country,
          avatarFileId: artists.avatarFileId,
          followers: sql<number>`(select count(*)::int from ${follows} f where f.artist_id = ${artists.id})`,
          isFollowing: sql<boolean>`exists(select 1 from ${follows} f2 where f2.artist_id = ${artists.id} and f2.user_id = ${followedBy})`,
        })
        .from(artists)
        .where(where)
        .orderBy(desc(artists.createdAt))
        .limit(limit)
        .offset(offset),
      countQ,
    ]);
  } else {
    [rows, totalRow] = await Promise.all([base, countQ]);
    if (withCounts) {
      const ids2 = rows.map((r) => r.id);
      if (ids2.length) {
        const counts = await db
          .select({ artistId: follows.artistId, c: sql<number>`count(*)::int` })
          .from(follows)
          .where(inArray(follows.artistId, ids2))
          .groupBy(follows.artistId);
        const map = new Map(counts.map((c) => [c.artistId, c.c]));
        rows = rows.map((r) => ({ ...r, followers: map.get(r.id) ?? 0, isFollowing: false }));
      } else {
        rows = rows.map((r) => ({ ...r, followers: 0, isFollowing: false }));
      }
    } else {
      rows = rows.map((r) => ({ ...r, followers: 0, isFollowing: false }));
    }
  }

  const total = totalRow[0]?.total ?? 0;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      bio: r.bio,
      genre: r.genre,
      country: (r as { country?: string | null }).country ?? null,
      avatarFileId: r.avatarFileId,
      followers: (r as { followers?: number }).followers ?? 0,
      isFollowing: Boolean((r as { isFollowing?: boolean }).isFollowing),
    })),
    total,
  };
}

/* ------------------------------------------------------------------ */
/* Region discovery — random artists for the 5-day onboarding feed     */
/* ------------------------------------------------------------------ */

/** Random artists matching the user's region, topped up with global ones. */
export async function discoverArtistsByRegion(
  country: string | null,
  currentUserId?: string | null,
  want = 10,
): Promise<ArtistDTO[]> {
  const shape = {
    id: artists.id,
    name: artists.name,
    bio: artists.bio,
    genre: artists.genre,
    country: artists.country,
    avatarFileId: artists.avatarFileId,
    followers: sql<number>`(select count(*)::int from ${follows} f where f.artist_id = ${artists.id})`,
  };

  const regional = country
    ? await db.select(shape).from(artists).where(eq(artists.country, country)).orderBy(sql`random()`).limit(want)
    : [];

  let globalRows: typeof regional = [];
  if (regional.length < want) {
    const excludeIds = regional.map((r) => r.id);
    globalRows = await db
      .select(shape)
      .from(artists)
      .where(
        excludeIds.length
          ? and(isNull(artists.country), notInArray(artists.id, excludeIds))
          : isNull(artists.country),
      )
      .orderBy(sql`random()`)
      .limit(want - regional.length);
  }

  const combined = [...regional, ...globalRows];

  // is the current user following any of these?
  let followedSet = new Set<string>();
  if (currentUserId && combined.length) {
    const rows2 = await db
      .select({ artistId: follows.artistId })
      .from(follows)
      .where(and(eq(follows.userId, currentUserId), inArray(follows.artistId, combined.map((c) => c.id))));
    followedSet = new Set(rows2.map((r) => r.artistId));
  }

  return combined.map((r) => ({
    id: r.id,
    name: r.name,
    bio: r.bio,
    genre: r.genre,
    country: r.country,
    avatarFileId: r.avatarFileId,
    followers: Number(r.followers ?? 0),
    isFollowing: followedSet.has(r.id),
  }));
}

export async function getArtistById(id: string, currentUserId?: string | null): Promise<ArtistDTO | null> {
  // Never filter by follow status here — the artist page must work for everyone.
  const [row] = await db
    .select({
      id: artists.id,
      name: artists.name,
      bio: artists.bio,
      genre: artists.genre,
      country: artists.country,
      avatarFileId: artists.avatarFileId,
    })
    .from(artists)
    .where(eq(artists.id, id))
    .limit(1);
  if (!row) return null;

  // follower count — separate, simple query
  const [fc] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.artistId, id));

  // is the current user following?
  let isFollowing = false;
  if (currentUserId) {
    const [f] = await db
      .select({ x: sql`1` })
      .from(follows)
      .where(and(eq(follows.artistId, id), eq(follows.userId, currentUserId)))
      .limit(1);
    isFollowing = !!f;
  }

  return {
    ...row,
    followers: Number(fc?.count ?? 0),
    isFollowing,
  };
}

/** One query: which of these song ids has the user liked? (bulk flag stamping) */
export async function likedSongIds(userId: string, songIds: string[]): Promise<Set<string>> {
  if (songIds.length === 0) return new Set();
  const rows = await db
    .select({ songId: likes.songId })
    .from(likes)
    .where(and(eq(likes.userId, userId), inArray(likes.songId, songIds)));
  return new Set(rows.map((r) => r.songId));
}

/** Recent plays with full song + artist data — one roundtrip. */
export async function recentPlaysRaw(userId: string, limit = 10): Promise<SongDTO[]> {
  const rows = await db
    .select({
      lastPlayed: sql<string>`max(${plays.playedAt})`,
      id: songs.id,
      title: songs.title,
      description: songs.description,
      audioFileId: songs.audioFileId,
      coverFileId: songs.coverFileId,
      durationSec: songs.durationSec,
      genre: songs.genre,
      plays: songs.plays,
      createdAt: songs.createdAt,
      artistId: artists.id,
      artistName: artists.name,
      artistAvatar: artists.avatarFileId,
      artistCountry: artists.country,
    })
    .from(plays)
    .innerJoin(songs, eq(songs.id, plays.songId))
    .innerJoin(artists, eq(artists.id, songs.primaryArtistId))
    .where(eq(plays.userId, userId))
    .groupBy(
      songs.id, songs.title, songs.description, songs.audioFileId, songs.coverFileId,
      songs.durationSec, songs.genre, songs.plays, songs.createdAt,
      artists.id, artists.name, artists.avatarFileId, artists.country,
    )
    .orderBy(desc(sql`max(${plays.playedAt})`))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    audioFileId: r.audioFileId,
    coverFileId: r.coverFileId,
    durationSec: r.durationSec,
    genre: r.genre,
    plays: r.plays,
    createdAt: r.createdAt.toISOString(),
    primaryArtist: { id: r.artistId, name: r.artistName, avatarFileId: r.artistAvatar, country: r.artistCountry },
    artists: [{ id: r.artistId, name: r.artistName, role: "primary" as const }],
    liked: false,
  }));
}

/** Featured artists for the given song ids — one roundtrip. */
export async function featuredForSongs(songIds: string[]) {
  if (songIds.length === 0) return new Map<string, { id: string; name: string }[]>();
  const rows = await db
    .select({ songId: songArtists.songId, artistId: songArtists.artistId, name: artists.name })
    .from(songArtists)
    .innerJoin(artists, eq(artists.id, songArtists.artistId))
    .where(inArray(songArtists.songId, songIds));
  const map = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    if (!map.has(r.songId)) map.set(r.songId, []);
    map.get(r.songId)!.push({ id: r.artistId, name: r.name });
  }
  return map;
}

/** Following artists with follower counts — one roundtrip. */
export async function followingArtistsRaw(userId: string, limit = 10): Promise<ArtistDTO[]> {
  const rows = await db
    .select({
      id: artists.id,
      name: artists.name,
      bio: artists.bio,
      genre: artists.genre,
      country: artists.country,
      avatarFileId: artists.avatarFileId,
    })
    .from(follows)
    .innerJoin(artists, eq(artists.id, follows.artistId))
    .where(eq(follows.userId, userId))
    .orderBy(desc(follows.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    followers: 0,
    isFollowing: true,
  }));
}

/** ------------------------------------------------------------------ */
/* Jam helpers                                                         */
/* ------------------------------------------------------------------ */

export async function isJamParticipant(jamId: string, userId: string): Promise<boolean> {
  const r = await db
    .select({ x: sql`1` })
    .from(jamParticipants)
    .where(and(eq(jamParticipants.jamId, jamId), eq(jamParticipants.userId, userId)));
  return r.length > 0;
}

export async function getJamMessages(jamId: string, after?: string | null, limit = 50) {
  const conditions = [eq(jamMessages.jamId, jamId)];
  if (after) {
    const d = new Date(after);
    if (!Number.isNaN(d.getTime())) conditions.push(gte(jamMessages.createdAt, d));
  }
  const rows = await db
    .select({
      id: jamMessages.id,
      userId: jamMessages.userId,
      userName: user.name,
      userImage: user.image,
      content: jamMessages.content,
      createdAt: jamMessages.createdAt,
    })
    .from(jamMessages)
    .innerJoin(user, eq(user.id, jamMessages.userId))
    .where(and(...conditions))
    .orderBy(desc(jamMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/* ------------------------------------------------------------------ */
/* Blend taste match                                                   */
/* ------------------------------------------------------------------ */

/** Overlap % between members' liked songs. */
export async function blendTasteMatch(blendId: string): Promise<number> {
  const members = await db
    .select({ userId: blendMembers.userId })
    .from(blendMembers)
    .where(eq(blendMembers.blendId, blendId));
  if (members.length < 2) return 0;
  const userIds = members.map((m) => m.userId);
  const rows = await db
    .select({ userId: likes.userId, songId: likes.songId })
    .from(likes)
    .where(inArray(likes.userId, userIds));
  if (rows.length === 0) return 0;
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, new Set());
    byUser.get(r.userId)!.add(r.songId);
  }
  const sets = [...byUser.values()];
  if (sets.length === 0) return 0;
  const union = new Set<string>();
  for (const s of sets) for (const x of s) union.add(x);
  if (union.size === 0) return 0;
  let inter = sets[0];
  for (const s of sets.slice(1)) {
    inter = new Set([...inter].filter((x) => s.has(x)));
  }
  return Math.round((inter.size / union.size) * 100);
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

export async function searchAll(q: string, currentUserId?: string | null) {
  // Multi-term search: every term must match SOMEWHERE across the song's
  // title, any of its artists (primary + featured), description or genre —
  // so "zaalima pritam" and "arijit tum se" both work.
  // Backed by pg_trgm GIN indexes (instant: new uploads are searchable
  // immediately — the index updates on insert, nothing to refresh).
  const terms = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[\\%_]/g, (m) => `\\${m}`)) // escape LIKE wildcards
    .slice(0, 6);
  if (terms.length === 0) return { songs: [], artists: [] };

  const matchesSomewhere = (t: string) => {
    const like = `%${t}%`;
    return or(
      ilike(songs.title, like),
      ilike(songs.description, like),
      ilike(songs.genre, like),
      // ANY credited artist — primary or featured
      exists(
        db
          .select({ x: sql`1` })
          .from(songArtists)
          .innerJoin(artists, eq(artists.id, songArtists.artistId))
          .where(and(eq(songArtists.songId, songs.id), ilike(artists.name, like))),
      ),
    );
  };

  // relevance: +1 per term matching the title, +2 extra for a title prefix
  // ("ari" ranks "Arijit Singh" tracks over songs that only mention it)
  const titleScore = sql.join(
    terms.map(
      (t) =>
        sql`(case when ${songs.title} ilike ${`%${t}%`} then 1 else 0 end) + (case when ${songs.title} ilike ${`${t}%`} then 2 else 0 end)`,
    ),
    sql` + `,
  );

  const [songRows, artistRows] = await Promise.all([
    (async () => {
      // strict AND: every term must match somewhere
      const rows = await db
        .select({ id: songs.id, score: sql<number>`(${titleScore})` })
        .from(songs)
        .where(and(...terms.map(matchesSomewhere)))
        .orderBy(desc(sql`(${titleScore})`), desc(songs.plays))
        .limit(25);
      if (rows.length > 0 || terms.length === 1) return rows;

      // fallback ("did you mean"): any term matches, ranked by how many do —
      // "shafqat tere naina" still surfaces Tere Naina at the top
      const matchScore = sql.join(
        terms.map((t) => sql`(case when ${matchesSomewhere(t)} then 1 else 0 end)`),
        sql` + `,
      );
      return db
        .select({ id: songs.id, score: sql<number>`(${matchScore})` })
        .from(songs)
        .where(or(...terms.map(matchesSomewhere)))
        .orderBy(desc(sql`(${matchScore})`), desc(sql`(${titleScore})`), desc(songs.plays))
        .limit(10);
    })(),
    db
      .select({ id: artists.id })
      .from(artists)
      .where(
        and(
          ...terms.map((t) => or(ilike(artists.name, `%${t}%`), ilike(artists.genre, `%${t}%`))),
        ),
      )
      .orderBy(desc(artists.createdAt))
      .limit(10),
  ]);

  const [songRes, artistRes] = await Promise.all([
    // hydrate in relevance order (songRows is already ranked)
    listSongsByIds(songRows.map((s) => s.id), currentUserId),
    listArtists({ ids: artistRows.map((a) => a.id), limit: 10, followedBy: currentUserId ?? undefined }),
  ]);
  return { songs: songRes, artists: artistRes.rows };
}

/** Hydrate full SongDTOs preserving the given (relevance) order. */
async function listSongsByIds(ids: string[], currentUserId?: string | null): Promise<SongDTO[]> {
  if (ids.length === 0) return [];
  const { rows } = await listSongs({ ids, limit: ids.length, currentUserId });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((s): s is SongDTO => !!s);
}
