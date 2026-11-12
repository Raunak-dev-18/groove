/* Shared DTOs between API and UI (web + mobile). Keep in sync with /api responses. */

export type Role = "user" | "moderator" | "manager" | "admin" | "super_admin";

export interface UserDTO {
  id: string;
  name: string;
  email?: string;
  image: string | null;
  role: Role;
}

export interface ArtistOnSong {
  id: string;
  name: string;
  avatarFileId?: string | null;
  role: "primary" | "featured";
}

export interface SongDTO {
  id: string;
  title: string;
  description: string;
  audioFileId: string;
  coverFileId: string | null;
  durationSec: number;
  genre: string;
  plays: number;
  createdAt: string;
  primaryArtist: { id: string; name: string; avatarFileId: string | null; country: string | null };
  artists: ArtistOnSong[];
  liked: boolean;
}

export interface ArtistDTO {
  id: string;
  name: string;
  bio: string;
  genre: string;
  country: string | null;
  avatarFileId: string | null;
  followers: number;
  isFollowing: boolean;
}

export interface JamMessageDTO {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  content: string;
  createdAt: string;
}

export interface ParticipantDTO {
  id: string;
  name: string;
  image: string | null;
  isHost: boolean;
}

export interface JamStateDTO {
  id: string;
  name: string;
  code: string;
  hostId: string;
  isPlaying: boolean;
  positionSec: number;
  /** Server-computed playhead at response time — clients sync against this. */
  positionNow: number;
  updatedAt: string;
  serverTime: string;
  currentSong: SongDTO | null;
  host: { id: string; name: string; image: string | null };
  participants: ParticipantDTO[];
}

export interface BlendDTO {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  songCount: number;
  tasteMatch: number;
  createdAt: string;
}

export interface BlendSongDTO extends SongDTO {
  addedByName: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  nextOffset: number | null;
}
