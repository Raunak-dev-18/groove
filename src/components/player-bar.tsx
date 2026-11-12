"use client";

import Link from "next/link";
import {
  AudioLines,
  Heart,
  Infinity as InfinityIcon,
  Radio,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  Pause,
  Play,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Artwork } from "@/components/artwork";
import { usePlayer, useToast } from "@/components/providers";
import { api } from "@/lib/client";
import { cn, formatDuration } from "@/lib/utils";

/** Global bottom player bar — works in normal and Jam mode. */
export function PlayerBar() {
  const player = usePlayer();
  const { toast } = useToast();
  const [dragging, setDragging] = useState<number | null>(null);

  const song = player.current;
  const position = dragging ?? player.position;
  const duration = player.duration || song?.durationSec || 0;

  // like state for the current song
  const [liked, setLiked] = useState(false);
  useEffect(() => {
    setLiked(!!song?.liked);
  }, [song?.id, song?.liked]);

  const toggleLike = async () => {
    if (!song) return;
    try {
      if (liked) {
        await api(`/api/songs/${song.id}/like`, { method: "DELETE" });
        setLiked(false);
      } else {
        await api(`/api/songs/${song.id}/like`, { method: "PUT" });
        setLiked(true);
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink/60 bg-panel">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
        {/* Track info */}
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-64 sm:flex-none">
          {song ? (
            <>
              <Artwork fileId={song.coverFileId} alt={song.title} className="h-11 w-11" rounded="rounded-lg" />
              <div className="min-w-0">
                <Link href={`/artists/${song.primaryArtist.id}`} className="block truncate text-sm font-semibold hover:underline">
                  {song.title}
                </Link>
                <div className="truncate text-xs text-midgrey">
                  {song.primaryArtist.name}
                </div>
              </div>
              <button
                type="button"
                onClick={toggleLike}
                aria-label={liked ? "Unlike" : "Like"}
                className={cn(
                  "ml-1 shrink-0 rounded-full p-1.5",
                  liked ? "text-cream" : "text-midgrey hover:text-softwhite",
                )}
              >
                <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-midgrey">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ctlgrey/50">
                <AudioLines className="h-4 w-4" />
              </span>
              <span className="hidden sm:block">Pick a track to start</span>
            </div>
          )}
        </div>

        {/* Controls + progress */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={player.prev}
              aria-label="Previous"
              disabled={!song || !!player.jam}
              className="rounded-full p-1.5 text-midgrey transition-colors hover:text-softwhite disabled:opacity-30"
            >
              <SkipBack className="h-5 w-5" fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={player.toggle}
              aria-label={player.isPlaying ? "Pause" : "Play"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-cream text-ink transition-transform hover:scale-105"
            >
              {player.isPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              onClick={player.next}
              aria-label="Next"
              disabled={!song || !!player.jam}
              className="rounded-full p-1.5 text-midgrey transition-colors hover:text-softwhite disabled:opacity-30"
            >
              <SkipForward className="h-5 w-5" fill="currentColor" />
            </button>
          </div>
          <div className="hidden w-full max-w-xl items-center gap-2 sm:flex">
            <span className="w-10 text-right text-[11px] text-midgrey tabular-nums">
              {formatDuration(position)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.5}
              value={position}
              aria-label="Seek"
              onChange={(e) => setDragging(Number(e.target.value))}
              onPointerUp={() => {
                if (dragging != null) player.seek(dragging);
                setDragging(null);
              }}
              onKeyUp={() => {
                if (dragging != null) player.seek(dragging);
                setDragging(null);
              }}
              className="w-full"
            />
            <span className="w-10 text-[11px] text-midgrey tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Right side: autoplay, jam status + volume */}
        <div className="flex items-center justify-end gap-2 sm:w-64">
          <button
            type="button"
            onClick={player.toggleAutoplay}
            aria-label={player.autoplay ? "Autoplay on" : "Autoplay off"}
            title={
              player.autoplay
                ? "Autoplay on — when the queue ends, Groove keeps playing songs like your taste"
                : "Autoplay off — playback stops at the end of the queue"
            }
            className={cn(
              "rounded-full p-1.5 transition-colors",
              player.autoplay ? "text-cream" : "text-midgrey hover:text-softwhite",
            )}
          >
            <InfinityIcon className="h-5 w-5" />
          </button>
          {player.jam && (
            <span
              className="flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-softwhite"
              title={
                player.jam.isHost
                  ? "You're hosting this jam — playback controls everyone"
                  : "Listening in a jam — the host controls playback"
              }
            >
              {player.jam.isHost ? <Radio className="h-3.5 w-3.5" /> : <AudioLines className="h-3.5 w-3.5" />}
              <span className="hidden max-w-24 truncate sm:block">{player.jam.name}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-cream groove-pulse" />
            </span>
          )}
          <button
            type="button"
            onClick={player.toggleMute}
            aria-label={player.muted ? "Unmute" : "Mute"}
            className="hidden rounded-full p-1.5 text-midgrey hover:text-softwhite sm:block"
          >
            {player.muted || player.volume === 0 ? (
              <VolumeX className="h-5 w-5" />
            ) : player.volume < 0.5 ? (
              <Volume1 className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={player.muted ? 0 : player.volume}
            aria-label="Volume"
            onChange={(e) => player.setVolume(Number(e.target.value))}
            className="hidden w-20 sm:block"
          />
        </div>
      </div>

      {/* Mobile progress line */}
      <div className="h-1 w-full bg-softwhite/10 sm:hidden">
        <div
          className="h-full bg-cream transition-[width] duration-200"
          style={{ width: duration ? `${(position / duration) * 100}%` : "0%" }}
        />
      </div>
    </div>
  );
}
