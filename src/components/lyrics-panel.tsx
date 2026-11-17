"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/providers";
import { activeLineIndex, parseLyrics, type LyricLine } from "@/lib/lrc";
import { getLyrics, peekLyrics } from "@/lib/lyrics-cache";
import { cn } from "@/lib/utils";

/**
 * Full-screen lyrics view — Spotify-style, animated.
 *
 *  • Synced (LRC): lines light up as the song plays; the active line scales
 *    up with a soft glow, past lines dim. Auto-scroll keeps it centered;
 *    manual scrolling wins for a few seconds. Tap a line to seek there.
 *  • Plain: centered static text.
 *  • None: a quiet hint (the server fetches from LRCLIB on first ask).
 *  • Results are cached client-side (lyrics-cache) — reopening never
 *    refetches.
 */
export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const player = usePlayer();
  const song = player.current;

  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [raw, setRaw] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const manualScrollUntilRef = useRef(0);

  // lyrics are prefetched with the song — cached opens render instantly
  useEffect(() => {
    if (!song) return;
    let cancelled = false;

    const apply = (data: { lyrics: string | null; synced: boolean } | null) => {
      if (cancelled) return;
      if (data?.lyrics) {
        setRaw(data.lyrics);
        setSynced(data.synced);
        setState("ready");
      } else {
        setRaw(null);
        setState("none");
      }
    };

    const cached = peekLyrics(song.id);
    if (cached) {
      apply(cached);
      return;
    }
    setState("loading");
    void getLyrics(song.id).then(apply);
    return () => {
      cancelled = true;
    };
  }, [song?.id]);

  const lines: LyricLine[] = useMemo(
    () => (raw ? parseLyrics(raw, synced) : []),
    [raw, synced],
  );

  const active = useMemo(
    () => (synced && state === "ready" ? activeLineIndex(lines, player.position) : -1),
    [lines, player.position, synced, state],
  );

  // keep the active line centered unless the user scrolled recently
  useEffect(() => {
    if (active < 0 || !synced) return;
    if (Date.now() < manualScrollUntilRef.current) return;
    const el = activeRef.current;
    const box = scrollRef.current;
    if (el && box) {
      box.scrollTo({
        top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2,
        behavior: "smooth",
      });
    }
  }, [active, synced]);

  if (!song) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col animate-[lyrics-in_.35s_ease] bg-panel/95 backdrop-blur">
      {/* header */}
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-bold">{song.title}</span>
            {synced && state === "ready" && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-cream/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cream">
                <span className="h-1.5 w-1.5 animate-[groove-pulse_1.6s_ease-in-out_infinite] rounded-full bg-cream" />
                Synced
              </span>
            )}
          </div>
          <div className="truncate text-sm text-midgrey">{song.primaryArtist.name}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lyrics"
          className="rounded-full bg-softwhite/5 p-2 text-midgrey transition-colors hover:text-softwhite"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* body */}
      {state === "loading" && (
        <div className="flex flex-1 items-center justify-center text-sm text-midgrey">
          Loading lyrics…
        </div>
      )}

      {state === "none" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="text-lg font-semibold">No lyrics for this one yet</div>
          <div className="max-w-sm text-sm text-midgrey">
            We check the open lyrics database automatically — try again in a bit.
          </div>
        </div>
      )}

      {state === "ready" && (
        <div
          ref={scrollRef}
          onWheel={() => (manualScrollUntilRef.current = Date.now() + 4000)}
          onTouchMove={() => (manualScrollUntilRef.current = Date.now() + 4000)}
          className="flex-1 overflow-y-auto px-6 pb-[35vh] pt-[20vh] [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
        >
          <div className={cn("mx-auto max-w-2xl", !synced && "py-[10vh]")}>
            {lines.map((line, i) => {
              const isActive = i === active;
              const isPast = synced && active >= 0 && i < active;
              return (
                <button
                  key={i}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  disabled={!synced || line.time == null}
                  onClick={() => line.time != null && player.seek(line.time)}
                  style={
                    isActive
                      ? { textShadow: "0 0 24px rgba(248,230,188,0.35)" }
                      : undefined
                  }
                  className={cn(
                    "block origin-left will-change-transform",
                    "text-2xl font-semibold leading-relaxed",
                    synced ? "cursor-pointer py-1.5" : "cursor-default py-0.5",
                    "transition-[transform,color,opacity,text-shadow] duration-500 ease-out",
                    isActive
                      ? "scale-[1.07] text-cream"
                      : isPast
                        ? "scale-100 text-softwhite/20"
                        : "scale-100 text-softwhite/45",
                    synced && !isActive && "hover:text-softwhite/80",
                  )}
                >
                  {line.text || "♪"}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
