"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, LogIn, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/providers";
import { Modal } from "@/components/modal";
import { Spinner, EmptyState } from "@/components/skeletons";

export default function BlendListPage() {
  const { toast } = useToast();
  const [blends, setBlends] = useState<
    { id: string; name: string; code: string; ownerId: string; ownerName: string; createdAt: string }[]
  | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);

  useEffect(() => {
    api<{ blends: typeof blends }>("/api/blends").then((r) => setBlends(r.blends)).catch(() => {});
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ blend: { id: string } }>("/api/blends", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      window.location.href = `/blend/${res.blend.id}`;
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(false);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinBusy || !joinCode.trim()) return;
    setJoinBusy(true);
    try {
      const res = await api<{ blend: { id: string } }>("/api/blends/join", {
        method: "POST",
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      window.location.href = `/blend/${res.blend.id}`;
    } catch (err) {
      toast((err as Error).message, "error");
      setJoinBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
            <Heart className="h-8 w-8 text-cream" fill="currentColor" /> Blend
          </h1>
          <p className="mt-1 text-sm text-mist">
            Shared playlists with friends — see how your tastes match, build the tracklist together.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-full bg-cream px-5 py-2.5 font-bold text-ink transition-transform hover:scale-105"
        >
          <Plus className="h-5 w-5" /> New Blend
        </button>
      </div>

      {/* join by code */}
      <form
        onSubmit={join}
        className="flex flex-col gap-3 rounded-3xl border border-ink/40 bg-panel p-5 sm:flex-row sm:items-center"
      >
        <LogIn className="hidden h-5 w-5 shrink-0 text-midgrey sm:block" />
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="ENTER INVITE CODE (E.G. M9XW2A)"
          maxLength={6}
          className="flex-1 rounded-full border border-softwhite/15 bg-brand-deep/50 px-5 py-3 tracking-[0.2em] font-bold uppercase placeholder:tracking-normal placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={joinBusy || !joinCode.trim()}
          className="rounded-full bg-brand px-6 py-3 font-bold text-softwhite transition-transform hover:scale-105 disabled:opacity-50"
        >
          {joinBusy ? "Joining…" : "Join Blend"}
        </button>
      </form>

      {blends === null ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-8 w-8" />
        </div>
      ) : blends.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-10 w-10" />}
          title="No blends yet"
          subtitle="Create a Blend, invite friends with the code, and mix your favorites into one playlist."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blends.map((b) => (
            <Link
              key={b.id}
              href={`/blend/${b.id}`}
              className="rounded-3xl border border-ink/40 bg-panel p-5 transition-colors hover:bg-softwhite/5"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-deep px-3 py-1 text-xs font-bold tracking-widest text-mist">
                  {b.code}
                </span>
              </div>
              <div className="mt-3 text-lg font-bold">{b.name}</div>
              <div className="text-sm text-midgrey">Created by {b.ownerName}</div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a Blend">
        <form onSubmit={create} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">Blend name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Road trip mix"
              autoFocus
              className="w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 text-softwhite placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
          </label>
          <p className="text-sm text-midgrey">
            Share the invite code with friends — everyone adds songs and you see your taste match.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cream py-3 font-bold text-ink disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4 border-ink/30 border-t-ink" />}
            Create Blend
          </button>
        </form>
      </Modal>
    </div>
  );
}
