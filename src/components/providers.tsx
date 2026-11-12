"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { JamStateDTO, SongDTO } from "@/lib/types";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PlayerProvider>{children}</PlayerProvider>
    </ToastProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type Toast = { id: number; message: string; type: "info" | "error" | "success" };

const ToastContext = createContext<{ toast: (message: string, type?: Toast["type"]) => void }>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-24 z-100 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg ${
              t.type === "error"
                ? "border-red-400/30 bg-panel text-red-200"
                : t.type === "success"
                  ? "border-cream/30 bg-panel text-cream"
                  : "border-softwhite/15 bg-panel text-softwhite"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Player — global <audio>, queue, and Jam sync engine                 */
/* ------------------------------------------------------------------ */

export interface PlayerApi {
  current: SongDTO | null;
  queue: SongDTO[];
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  jam: { jamId: string; name: string; isHost: boolean } | null;
  autoplay: boolean;
  toggleAutoplay: () => void;
  playSong: (song: SongDTO, queue?: SongDTO[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  enterJam: (jamId: string, name: string, isHost: boolean) => void;
  exitJam: () => void;
  /** Participants call this with polled jam state; the player drift-corrects. */
  syncJamState: (state: JamStateDTO) => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}

function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<SongDTO | null>(null);
  const [queue, setQueue] = useState<SongDTO[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [jam, setJam] = useState<PlayerApi["jam"]>(null);
  const [autoplay, setAutoplay] = useState(true);

  const jamRef = useRef<PlayerApi["jam"]>(null);
  const lastCountedRef = useRef<string | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<SongDTO[]>([]);

  useEffect(() => {
    jamRef.current = jam;
  }, [jam]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // persisted autoplay preference ("radio" continuation like Spotify)
  useEffect(() => {
    try {
      const v = localStorage.getItem("groove-autoplay");
      if (v != null) setAutoplay(v === "1");
    } catch {
      /* private mode */
    }
  }, []);

  const toggleAutoplay = useCallback(() => {
    setAutoplay((a) => {
      try {
        localStorage.setItem("groove-autoplay", a ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !a;
    });
  }, []);

  /* Pre-load the next song in the queue: a hidden <audio preload="auto">
     warms the browser cache so skipping tracks starts instantly. */
  useEffect(() => {
    if (jam || !current || queue.length === 0) return;
    const idx = queue.findIndex((s) => s.id === current.id);
    if (idx < 0 || idx >= queue.length - 1) return;
    const next = queue[idx + 1];
    if (!next) return;
    try {
      if (!preloadRef.current) {
        const p = new Audio();
        p.preload = "auto";
        preloadRef.current = p;
      }
      const url = `/api/cdn/files/${next.audioFileId}`;
      if (preloadRef.current.src !== new URL(url, window.location.href).href) {
        preloadRef.current.src = url;
        preloadRef.current.load();
      }
    } catch {
      /* preloading is best-effort */
    }
  }, [current, queue, jam]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      a.volume = 0.9;
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const postControl = useCallback(
    async (body: Record<string, unknown>) => {
      const j = jamRef.current;
      if (!j?.isHost) return;
      try {
        await fetch(`/api/jams/${j.jamId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        /* host controls are best-effort; next poll corrects */
      }
    },
    [],
  );

  const loadSong = useCallback(
    (song: SongDTO, autoplay: boolean, startAt = 0) => {
      const a = ensureAudio();
      if (a.src !== `/api/cdn/files/${song.audioFileId}`) {
        a.src = `/api/cdn/files/${song.audioFileId}`;
      }
      setCurrent(song);
      setPosition(startAt);
      if (startAt > 0) {
        const onLoaded = () => {
          a.currentTime = startAt;
          a.removeEventListener("loadedmetadata", onLoaded);
        };
        a.addEventListener("loadedmetadata", onLoaded);
      }
      if (autoplay) {
        a.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
      } else {
        a.pause();
        setIsPlaying(false);
      }
      if (lastCountedRef.current !== song.id) {
        lastCountedRef.current = song.id;
        fetch(`/api/songs/${song.id}/play`, { method: "POST" }).catch(() => {});
      }
    },
    [ensureAudio],
  );

  const playSong = useCallback(
    (song: SongDTO, list?: SongDTO[]) => {
      if (list) setQueue(list);
      loadSong(song, true, 0);
      if (jamRef.current?.isHost) {
        void postControl({ songId: song.id, isPlaying: true, positionSec: 0 });
      }
    },
    [loadSong, postControl],
  );

  const toggle = useCallback(() => {
    const a = ensureAudio();
    const j = jamRef.current;
    if (!current && queue.length > 0) {
      loadSong(queue[0], true, 0);
      return;
    }
    if (!current) return;
    if (a.paused) {
      a.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
      if (j?.isHost) void postControl({ isPlaying: true, positionSec: a.currentTime });
    } else {
      a.pause();
      setIsPlaying(false);
      if (j?.isHost) void postControl({ isPlaying: false, positionSec: a.currentTime });
    }
  }, [current, ensureAudio, loadSong, postControl, queue]);

  const seek = useCallback(
    (sec: number) => {
      const a = ensureAudio();
      a.currentTime = sec;
      setPosition(sec);
      if (jamRef.current?.isHost) {
        void postControl({ isPlaying: !a.paused, positionSec: sec });
      }
    },
    [ensureAudio, postControl],
  );

  /** Autoplay radio — when the queue runs dry, extend with taste-based
   *  recommendations and keep playing (Spotify-style). */
  const extendRadio = useCallback(async () => {
    try {
      const exclude = queueRef.current.map((s) => s.id).join(",");
      const res = await fetch(`/api/recommendations?limit=10&exclude=${exclude}`);
      const data = (await res.json()) as { songs?: SongDTO[] };
      if (Array.isArray(data.songs) && data.songs.length > 0) {
        const old = queueRef.current;
        const nq = [...old, ...data.songs];
        queueRef.current = nq;
        setQueue(nq);
        playSong(nq[old.length], nq);
      }
    } catch {
      /* offline / server hiccup — playback simply stops */
    }
  }, [playSong]);

  const next = useCallback(() => {
    if (!current || queue.length === 0) return;
    const idx = queue.findIndex((s) => s.id === current.id);
    if (idx >= 0 && idx < queue.length - 1) {
      playSong(queue[idx + 1], queue);
    } else if (idx === queue.length - 1 && autoplay && !jamRef.current) {
      void extendRadio();
    }
  }, [current, playSong, queue, autoplay, extendRadio]);

  const prev = useCallback(() => {
    if (!current || queue.length === 0) return;
    if (position > 3) {
      seek(0);
      return;
    }
    const idx = queue.findIndex((s) => s.id === current.id);
    if (idx > 0) playSong(queue[idx - 1], queue);
  }, [current, playSong, position, queue, seek]);

  const syncJamState = useCallback(
    (state: JamStateDTO) => {
      const a = ensureAudio();
      const j = jamRef.current;
      if (j?.isHost) return; // host is the source of truth — never self-correct

      const song = state.currentSong;
      if (!song) {
        if (!a.paused) a.pause();
        setIsPlaying(false);
        return;
      }
      if (current?.id !== song.id) {
        // different track in the jam — load it at the jam's position
        setCurrent(song);
        loadSong(song, state.isPlaying, state.positionNow);
        return;
      }
      // same track — drift correction (> 2s)
      if (Math.abs(a.currentTime - state.positionNow) > 2) {
        a.currentTime = state.positionNow;
        setPosition(state.positionNow);
      }
      if (state.isPlaying && a.paused) {
        a.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
      } else if (!state.isPlaying && !a.paused) {
        a.pause();
        setIsPlaying(false);
      }
    },
    [current, ensureAudio, loadSong],
  );

  const enterJam = useCallback((jamId: string, name: string, isHost: boolean) => {
    setJam({ jamId, name, isHost });
  }, []);

  const exitJam = useCallback(() => {
    setJam(null);
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      const a = ensureAudio();
      a.volume = v;
      setVolumeState(v);
      if (v > 0 && muted) setMuted(false);
    },
    [ensureAudio, muted],
  );

  const toggleMute = useCallback(() => {
    const a = ensureAudio();
    a.muted = !muted;
    setMuted(!muted);
  }, [ensureAudio, muted]);

  // audio element event wiring
  useEffect(() => {
    const a = ensureAudio();
    const onTime = () => setPosition(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => {
      if (!jamRef.current) {
        // normal queue mode → auto-next
        next();
      } else if (!jamRef.current.isHost) {
        setIsPlaying(false); // participant: wait for the host's next pick
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [ensureAudio, next]);

  const value = useMemo<PlayerApi>(
    () => ({
      current,
      queue,
      isPlaying,
      position,
      duration,
      volume,
      muted,
      jam,
      autoplay,
      toggleAutoplay,
      playSong,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      enterJam,
      exitJam,
      syncJamState,
    }),
    [
      current,
      queue,
      isPlaying,
      position,
      duration,
      volume,
      muted,
      jam,
      autoplay,
      toggleAutoplay,
      playSong,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      enterJam,
      exitJam,
      syncJamState,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
