"use client";

import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { usePlayer } from "@/components/providers";
import { Artwork } from "@/components/artwork";
import { cn, formatDuration } from "@/lib/utils";
import { prefetchSong } from "@/lib/song-cache";
import type { SongDTO } from "@/lib/types";

/** Grid card for a track/section rail. */
export function SongCard({ song, queue }: { song: SongDTO; queue?: SongDTO[] }) {
  const player = usePlayer();
  const isCurrent = player.current?.id === song.id;
  const isPlayingThis = isCurrent && player.isPlaying;

  return (
    <div className="group relative w-36 shrink-0 sm:w-44" onMouseEnter={() => prefetchSong(song.id)}>
      <div className="relative">
        <Artwork fileId={song.coverFileId} alt={song.title} className="aspect-square w-full" />
        <button
          type="button"
          onClick={() => (isPlayingThis ? player.toggle() : player.playSong(song, queue ?? [song]))}
          aria-label={isPlayingThis ? `Pause ${song.title}` : `Play ${song.title}`}
          className={cn(
            "absolute right-2 bottom-2 flex h-11 w-11 items-center justify-center rounded-full bg-cream text-ink shadow-lg transition-all hover:scale-105",
            isPlayingThis ? "opacity-100" : "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0",
          )}
        >
          {isPlayingThis ? (
            <Pause className="h-5 w-5" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
          )}
        </button>
      </div>
      <Link href={`/track/${song.id}`} className="mt-2 block truncate font-semibold hover:underline">
        {song.title}
      </Link>
      <Link
        href={`/artists/${song.primaryArtist.id}`}
        className="mt-0.5 block truncate text-sm text-midgrey hover:text-cream hover:underline"
      >
        {song.primaryArtist.name}
        {song.durationSec > 0 && (
          <span className="ml-1 text-midgrey/70">· {formatDuration(song.durationSec)}</span>
        )}
      </Link>
    </div>
  );
}
