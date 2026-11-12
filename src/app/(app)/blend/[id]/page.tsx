"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, LogOut, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { usePlayer, useToast } from "@/components/providers";
import { Avatar } from "@/components/avatar";
import { SongRow } from "@/components/song-row";
import { Modal } from "@/components/modal";
import { Spinner, EmptyState } from "@/components/skeletons";
import { useSession } from "@/lib/auth-client";
import type { SongDTO } from "@/lib/types";

interface BlendDetail {
  blend: {
    id: string;
    name: string;
    code: string;
    ownerId: string;
    createdAt: string;
    tasteMatch: number;
    members: { id: string; name: string; image: string | null; isOwner: boolean }[];
    songs: (SongDTO & { addedByName: string })[];
  };
}

export default function BlendDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const player = usePlayer();
  const { toast } = useToast();
  const { data: session } = useSession();

  const [data, setData] = useState<BlendDetail["blend"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SongDTO[]>([]);
  const [addingSongId, setAddingSongId] = useState<string | null>(null);

  const myId = session?.user?.id;
  const isOwner = data?.ownerId === myId;

  const load = useCallback(() => {
    api<BlendDetail>(`/api/blends/${id}`)
      .then((r) => setData(r.blend))
      .catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

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

  const addSong = async (songId: string) => {
    setAddingSongId(songId);
    try {
      await api(`/api/blends/${id}/songs`, { method: "POST", body: JSON.stringify({ songId }) });
      toast("Added to the blend!", "success");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setAddingSongId(null);
    }
  };

  const removeSong = async (songId: string) => {
    try {
      await api(`/api/blends/${id}/songs?songId=${songId}`, { method: "DELETE" });
      setData((d) => (d ? { ...d, songs: d.songs.filter((s) => s.id !== songId) } : d));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const leave = async () => {
    try {
      await api(`/api/blends/${id}/leave`, { method: "POST" });
    } finally {
      router.push("/blend");
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/blend")} className="flex items-center gap-2 text-midgrey hover:text-softwhite">
          <ArrowLeft className="h-4 w-4" /> Back to Blends
        </button>
        <EmptyState title="Can't open this blend" subtitle={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/blend")}
          className="rounded-full p-2 text-midgrey hover:bg-softwhite/10 hover:text-softwhite"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{data.name}</h1>
          <p className="text-sm text-midgrey">
            Code{" "}
            <button
              onClick={() => {
                navigator.clipboard?.writeText(data.code);
                toast("Invite code copied!", "success");
              }}
              className="inline-flex items-center gap-1 font-bold tracking-widest text-cream hover:underline"
            >
              {data.code} <Copy className="h-3 w-3" />
            </button>
          </p>
        </div>
        <button
          onClick={leave}
          className="flex items-center gap-2 rounded-full border border-softwhite/20 px-4 py-2 text-sm font-semibold text-midgrey transition-colors hover:border-red-300/40 hover:text-red-200"
        >
          {isOwner ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
          {isOwner ? "Delete" : "Leave"}
        </button>
      </div>

      {/* taste match + members */}
      <div className="flex flex-col gap-6 rounded-3xl border border-ink/40 bg-panel p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 sm:w-56">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream text-xl font-extrabold text-ink">
            {data.tasteMatch}%
          </span>
          <div>
            <p className="flex items-center gap-1.5 font-bold">
              <Sparkles className="h-4 w-4 text-cream" /> Taste match
            </p>
            <p className="text-xs text-midgrey">Based on liked songs across members</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 sm:flex-1 sm:justify-end">
          {data.members.map((m) => (
            <div key={m.id} className="flex w-20 flex-col items-center gap-1.5 text-center">
              <div className="relative">
                <Avatar name={m.name} image={m.image} className="h-14 w-14" />
                {m.isOwner && (
                  <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-cream text-[10px] font-bold text-ink">
                    ★
                  </span>
                )}
              </div>
              <span className="w-full truncate text-xs font-semibold">{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* tracklist */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Tracklist <span className="text-sm font-medium text-midgrey">{data.songs.length} songs</span>
          </h2>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-full bg-cream px-5 py-2.5 font-bold text-ink transition-transform hover:scale-105"
          >
            <Plus className="h-4 w-4" /> Add songs
          </button>
        </div>
        {data.songs.length > 0 ? (
          <div>
            {data.songs.map((s, i) => (
              <div key={s.id} className="group flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <SongRow song={s} queue={data.songs} index={i} />
                </div>
                <span className="hidden w-24 truncate text-xs text-midgrey lg:block">
                  {s.addedByName}
                </span>
                <button
                  onClick={() => removeSong(s.id)}
                  aria-label="Remove from blend"
                  className="rounded-full p-2 text-midgrey opacity-0 transition-all group-hover:opacity-100 hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Empty blend"
            subtitle="Add the first songs — everything members add shows up here."
          />
        )}
      </section>

      {/* add songs modal */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add songs to the Blend" wide>
        <div className="space-y-4">
          <input
            value={searchQuery}
            onChange={(e) => searchSongs(e.target.value)}
            placeholder="Search songs…"
            autoFocus
            className="w-full rounded-full border border-softwhite/15 bg-brand-deep/50 px-5 py-3 placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
          />
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {searchResults.map((s) => {
              const inBlend = data.songs.some((b) => b.id === s.id);
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <SongRow song={s} queue={searchResults} compact onLike={() => {}} />
                  </div>
                  <button
                    onClick={() => addSong(s.id)}
                    disabled={inBlend || addingSongId === s.id}
                    className="shrink-0 rounded-full bg-cream px-4 py-2 text-sm font-bold text-ink disabled:opacity-40"
                  >
                    {addingSongId === s.id ? (
                      <Spinner className="h-4 w-4 border-ink/30 border-t-ink" />
                    ) : inBlend ? (
                      "Added"
                    ) : (
                      "Add"
                    )}
                  </button>
                </div>
              );
            })}
            {searchQuery && searchResults.length === 0 && (
              <p className="py-6 text-center text-sm text-midgrey">No songs found.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
