"use client";

import { Heart, Pause, Play } from "lucide-react";
import Link from "next/link";
import { usePlayer } from "@/components/providers";
import { Artwork } from "@/components/artwork";
import { SongContextMenu } from "@/components/song-context-menu";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import type { SongDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { prefetchSong } from "@/lib/song-cache";
import { useState } from "react";

/** One track row in a list — click to play, heart to like. */
export function SongRow({
  song,
  queue,
  index,
  showPlays = true,
  onLike,
  compact = false,
  playlistId,
  onSongRemoved,
}: {
  song: SongDTO;
  queue?: SongDTO[];
  index?: number;
  showPlays?: boolean;
  onLike?: (song: SongDTO) => void;
  compact?: boolean;
  playlistId?: string;
  onSongRemoved?: () => void;
}) {
  const player = usePlayer();
  const [liking, setLiking] = useState(false);
  const isCurrent = player.current?.id === song.id;
  const isPlayingThis = isCurrent && player.isPlaying;

  const like = async () => {
    if (liking) return;
    setLiking(true);
    try {
      if (song.liked) {
        await api(`/api/songs/${song.id}/like`, { method: "DELETE" });
        song.liked = false;
      } else {
        await api(`/api/songs/${song.id}/like`, { method: "PUT" });
        song.liked = true;
      }
      onLike?.(song);
    } finally {
      setLiking(false);
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-softwhite/5",
        isCurrent && "bg-softwhite/8",
      )}
      onMouseEnter={() => prefetchSong(song.id)}
    >
      <button
        type="button"
        onClick={() => (isPlayingThis ? player.toggle() : player.playSong(song, queue ?? [song]))}
        className="relative shrink-0 cursor-pointer"
        aria-label={isPlayingThis ? `Pause ${song.title}` : `Play ${song.title}`}
      >
        <Artwork fileId={song.coverFileId} alt={song.title} className={compact ? "h-11 w-11" : "h-13 w-13"} rounded="rounded-xl" />
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-xl bg-ink/45 opacity-0 transition-opacity group-hover:opacity-100",
            isPlayingThis && "opacity-100",
          )}
        >
          {isPlayingThis ? (
            <Pause className="h-5 w-5 text-cream" fill="currentColor" />
          ) : (
            <Play className="h-5 w-5 text-cream" fill="currentColor" />
          )}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <Link
          href={`/track/${song.id}`}
          className={cn(
            "block truncate font-semibold hover:underline",
            isCurrent && "text-cream"
          )}
        >
          {song.title}
        </Link>
        <div className="truncate text-sm text-midgrey">
          {song.artists.map((a) => (
            <Link
              key={a.id}
              href={`/artists/${a.id}`}
              className="hover:text-cream hover:underline"
            >
              {a.name}
            </Link>
          )).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}
        </div>
      </div>

      {showPlays && !compact && (
        <span className="hidden w-20 text-right text-sm text-midgrey sm:block">
          {formatCount(song.plays)} plays
        </span>
      )}
      <span className="w-12 text-right text-sm text-midgrey tabular-nums">
        {formatDuration(song.durationSec)}
      </span>
      <button
        type="button"
        onClick={like}
        disabled={liking}
        aria-label={song.liked ? "Unlike" : "Like"}
        className={cn(
          "shrink-0 rounded-full p-2 transition-colors",
          song.liked ? "text-cream" : "text-midgrey opacity-0 group-hover:opacity-100 hover:text-cream",
        )}
      >
        <Heart className="h-4 w-4" fill={song.liked ? "currentColor" : "none"} />
      </button>
      <div className="shrink-0">
        <SongContextMenu song={song} playlistId={playlistId} onSongRemoved={onSongRemoved} />
      </div>
    </div>
  );
}
