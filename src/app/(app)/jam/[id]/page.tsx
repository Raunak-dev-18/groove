"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, LogOut, Play, Search, Send, Users } from "lucide-react";
import { api } from "@/lib/client";
import { usePlayer, useToast } from "@/components/providers";
import { Avatar } from "@/components/avatar";
import { Artwork } from "@/components/artwork";
import { SongRow } from "@/components/song-row";
import { Modal } from "@/components/modal";
import { Spinner, EmptyState } from "@/components/skeletons";
import { cn, formatDuration } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import type { ArtistDTO, JamStateDTO, JamMessageDTO, SongDTO } from "@/lib/types";

export default function JamRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const player = usePlayer();
  const { toast } = useToast();
  const { data: session } = useSession();

  const [state, setState] = useState<JamStateDTO | null>(null);
  const [messages, setMessages] = useState<JamMessageDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [picking, setPicking] = useState(false);
  const [searchResults, setSearchResults] = useState<SongDTO[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const lastMsgAtRef = useRef<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const myId = session?.user?.id;
  const isHost = state?.hostId === myId;

  /* keep the latest sync function in a ref so `poll` stays stable */
  const syncRef = useRef(player.syncJamState);
  useEffect(() => {
    syncRef.current = player.syncJamState;
  });

  /* ---------------- polling: state + chat ---------------- */
  const poll = useCallback(async () => {
    try {
      const after = lastMsgAtRef.current ? `?msgAfter=${encodeURIComponent(lastMsgAtRef.current)}` : "";
      const res = await api<{ jam: JamStateDTO; messages: JamMessageDTO[] }>(`/api/jams/${id}${after}`);
      setState(res.jam);
      if (res.messages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = res.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh].slice(-200) : prev;
        });
        lastMsgAtRef.current = res.messages[res.messages.length - 1].createdAt;
      }
      if (res.jam) syncRef.current(res.jam);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll]);

  // enter jam mode in the player
  useEffect(() => {
    if (state && myId) {
      player.enterJam(state.id, state.name, state.hostId === myId);
    }
    return () => player.exitJam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, myId, state?.hostId]);

  // chat autoscroll
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    setChatInput("");
    try {
      const res = await api<{ message: JamMessageDTO }>(`/api/jams/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages((prev) => [...prev, res.message]);
      lastMsgAtRef.current = res.message.createdAt;
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const pickSong = (song: SongDTO) => {
    player.playSong(song, [song]);
    setPicking(false);
    setSearchResults([]);
    setSearchQuery("");
  };

  const searchSongs = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api<{ songs: SongDTO[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.songs);
    } catch {
      /* ignore */
    }
  };

  const leave = async () => {
    try {
      await api(`/api/jams/${id}/leave`, { method: "POST" });
    } finally {
      player.exitJam();
      router.push("/jam");
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/jam")} className="flex items-center gap-2 text-midgrey hover:text-softwhite">
          <ArrowLeft className="h-4 w-4" /> Back to Jams
        </button>
        <EmptyState title="Can't open this jam" subtitle={error} />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const song = state.currentSong;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/jam")}
          className="rounded-full p-2 text-midgrey hover:bg-softwhite/10 hover:text-softwhite"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{state.name}</h1>
          <p className="text-sm text-midgrey">
            Hosted by {state.host.name} · Code{" "}
            <button
              onClick={() => {
                navigator.clipboard?.writeText(state.code);
                toast("Invite code copied!", "success");
              }}
              className="inline-flex items-center gap-1 font-bold tracking-widest text-cream hover:underline"
            >
              {state.code} <Copy className="h-3 w-3" />
            </button>
          </p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold",
            state.isPlaying ? "bg-brand-deep text-cream" : "bg-panel text-midgrey",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", state.isPlaying ? "bg-cream groove-pulse" : "bg-midgrey")} />
          {state.isPlaying ? "LIVE" : "PAUSED"}
        </span>
        <button
          onClick={leave}
          className="flex items-center gap-2 rounded-full border border-softwhite/20 px-4 py-2 text-sm font-semibold text-midgrey transition-colors hover:border-red-300/40 hover:text-red-200"
        >
          <LogOut className="h-4 w-4" /> Leave
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* left: now playing + participants + picker */}
        <div className="space-y-6">
          <div className="flex flex-col gap-5 rounded-3xl border border-ink/40 bg-panel p-6 sm:flex-row">
            <Artwork
              fileId={song?.coverFileId}
              alt={song?.title ?? "Nothing playing"}
              className="aspect-square w-full sm:w-48"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <p className="text-xs font-semibold tracking-wide text-midgrey uppercase">
                Now playing {state.isPlaying ? "" : "· paused at " + formatDuration(state.positionNow)}
              </p>
              {song ? (
                <>
                  <h2 className="truncate text-2xl font-extrabold">{song.title}</h2>
                  <p className="truncate text-mist">{song.artists.map((a) => a.name).join(", ")}</p>
                  {isHost ? (
                    <button
                      onClick={() => setPicking(true)}
                      className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-cream px-5 py-2.5 font-bold text-ink transition-transform hover:scale-105"
                    >
                      <Search className="h-4 w-4" /> Pick next song
                    </button>
                  ) : (
                    <p className="mt-3 text-sm text-midgrey">
                      Only the host controls playback — you hear everything in sync.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-extrabold text-mist">Waiting for the host…</h2>
                  <p className="text-sm text-midgrey">
                    {isHost
                      ? "Pick a song to start the jam — everyone hears it instantly."
                      : "The host hasn't picked a song yet."}
                  </p>
                  {isHost && (
                    <button
                      onClick={() => setPicking(true)}
                      className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-cream px-5 py-2.5 font-bold text-ink transition-transform hover:scale-105"
                    >
                      <Play className="h-4 w-4" fill="currentColor" /> Pick a song
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* participants */}
          <section className="rounded-3xl border border-ink/40 bg-panel p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Users className="h-5 w-5 text-cream" /> In this Jam
              <span className="text-sm font-medium text-midgrey">{state.participants.length}</span>
            </h3>
            <div className="mt-4 flex flex-wrap gap-4">
              {state.participants.map((p) => (
                <div key={p.id} className="flex w-20 flex-col items-center gap-1.5 text-center">
                  <div className="relative">
                    <Avatar name={p.name} image={p.image} className="h-14 w-14" />
                    {p.isHost && (
                      <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-cream text-[10px] font-bold text-ink">
                        H
                      </span>
                    )}
                  </div>
                  <span className="w-full truncate text-xs font-semibold">{p.name}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* right: dedicated chat window */}
        <section className="flex h-[32rem] flex-col rounded-3xl border border-ink/40 bg-panel lg:h-auto lg:min-h-[32rem]">
          <div className="border-b border-softwhite/10 px-5 py-4">
            <h3 className="font-bold">Jam chat</h3>
            <p className="text-xs text-midgrey">Talk while you listen</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && (
              <p className="pt-8 text-center text-sm text-midgrey">
                No messages yet — say hi 👋
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex gap-2.5", m.userId === myId && "flex-row-reverse")}
              >
                <Avatar name={m.userName} image={m.userImage} className="h-8 w-8" />
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    m.userId === myId
                      ? "rounded-tr-sm bg-cream text-ink"
                      : "rounded-tl-sm bg-brand-deep text-softwhite",
                  )}
                >
                  {m.userId !== myId && (
                    <p className="mb-0.5 text-[11px] font-bold text-mist">{m.userName}</p>
                  )}
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-softwhite/10 p-3">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Message the jam…"
              maxLength={500}
              className="flex-1 rounded-full border border-softwhite/15 bg-brand-deep/50 px-4 py-2.5 text-sm placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream text-ink transition-transform hover:scale-105 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>

      {/* song picker */}
      <Modal open={picking} onClose={() => setPicking(false)} title="Pick a song for the Jam" wide>
        <div className="space-y-4">
          <input
            value={searchQuery}
            onChange={(e) => searchSongs(e.target.value)}
            placeholder="Search songs…"
            autoFocus
            className="w-full rounded-full border border-softwhite/15 bg-brand-deep/50 px-5 py-3 placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
          />
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {searchResults.map((s) => (
              <SongRow key={s.id} song={s} queue={searchResults} compact onLike={() => {}} />
            ))}
            {searchQuery && searchResults.length === 0 && (
              <p className="py-6 text-center text-sm text-midgrey">No songs found.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
