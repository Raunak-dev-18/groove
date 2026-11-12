import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Better Auth core tables                                             */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // ISO 3166-1 alpha-2 country, captured from request headers (Cloudflare) or device locale
  country: text("country"),
  // Custom: "user" | "admin" | "super_admin"
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Music domain                                                        */
/* ------------------------------------------------------------------ */

export const artists = pgTable("artists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  bio: text("bio").notNull().default(""),
  genre: text("genre").notNull().default(""),
  // ISO 3166-1 alpha-2 — powers region-based discovery for new users
  country: text("country"),
  avatarFileId: text("avatar_file_id"),
  monthlyListeners: integer("monthly_listeners").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    audioFileId: text("audio_file_id").notNull(),
    coverFileId: text("cover_file_id"),
    durationSec: doublePrecision("duration_sec").notNull().default(0),
    genre: text("genre").notNull().default(""),
    plays: integer("plays").notNull().default(0),
    // Nullable + ON DELETE SET NULL: deleting an artist unbinds their songs
    // but never deletes the music itself.
    primaryArtistId: uuid("primary_artist_id")
      .references(() => artists.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("songs_created_idx").on(t.createdAt), index("songs_plays_idx").on(t.plays)],
);

export const songArtists = pgTable(
  "song_artists",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("featured"), // "primary" | "featured"
  },
  (t) => [primaryKey({ columns: [t.songId, t.artistId] })],
);

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("follows_user_artist_uq").on(t.userId, t.artistId)],
);

export const likes = pgTable(
  "likes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("likes_user_song_uq").on(t.userId, t.songId)],
);

export const plays = pgTable(
  "plays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plays_played_idx").on(t.playedAt), index("plays_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Jam — shared listening sessions with chat                           */
/* ------------------------------------------------------------------ */

export const jams = pgTable("jams", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 6-char invite code
  name: text("name").notNull(),
  hostId: text("host_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  currentSongId: uuid("current_song_id").references(() => songs.id, { onDelete: "set null" }),
  isPlaying: boolean("is_playing").notNull().default(false),
  positionSec: doublePrecision("position_sec").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const jamParticipants = pgTable(
  "jam_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jamId: uuid("jam_id")
      .notNull()
      .references(() => jams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("jam_participants_uq").on(t.jamId, t.userId)],
);

export const jamMessages = pgTable(
  "jam_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jamId: uuid("jam_id")
      .notNull()
      .references(() => jams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jam_messages_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Blend — collaborative taste-mix playlists                          */
/* ------------------------------------------------------------------ */

export const blends = pgTable("blends", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(), // 6-char invite code
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blendMembers = pgTable(
  "blend_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blendId: uuid("blend_id")
      .notNull()
      .references(() => blends.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("blend_members_uq").on(t.blendId, t.userId)],
);

export const blendSongs = pgTable(
  "blend_songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blendId: uuid("blend_id")
      .notNull()
      .references(() => blends.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    addedById: text("added_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("blend_songs_uq").on(t.blendId, t.songId)],
);

/* ------------------------------------------------------------------ */
/* User playlists — Spotify-style personal collections                 */
/* ------------------------------------------------------------------ */

export const playlists = pgTable("playlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  coverFileId: text("cover_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playlistSongs = pgTable(
  "playlist_songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("playlist_songs_uq").on(t.playlistId, t.songId)],
);

/* ------------------------------------------------------------------ */
/* Taste profile — per-user genre/artist affinity, computed from       */
/* likes, plays and follows; powers recommendations + autoplay radio. */
/* ------------------------------------------------------------------ */

export const tasteProfiles = pgTable("taste_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  profile: jsonb("profile").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const artistsRelations = relations(artists, ({ many }) => ({
  songs: many(songs),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  primaryArtist: one(artists, {
    fields: [songs.primaryArtistId],
    references: [artists.id],
  }),
  songArtists: many(songArtists),
}));

export type User = typeof user.$inferSelect;
export type Artist = typeof artists.$inferSelect;
export type Song = typeof songs.$inferSelect;
export type Jam = typeof jams.$inferSelect;
export type Blend = typeof blends.$inferSelect;

/** Helper used by the seed script to run raw SQL. */
export const nowSql = sql`now()`;
