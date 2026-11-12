"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AudioLines, LogIn, Plus, Radio } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/providers";
import { Modal } from "@/components/modal";
import { Spinner, EmptyState } from "@/components/skeletons";
import type { JamStateDTO } from "@/lib/types";

interface MyJams {
  jams: {
    id: string;
    name: string;
    code: string;
    hostId: string;
    hostName: string;
    isPlaying: boolean;
    updatedAt: string;
  }[];
}

export default function JamListPage() {
  const { toast } = useToast();
  const [jams, setJams] = useState<MyJams["jams"] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);

  const load = () => api<MyJams>("/api/jams").then((r) => setJams(r.jams)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ jam: { id: string } }>("/api/jams", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      window.location.href = `/jam/${res.jam.id}`;
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
      const res = await api<{ jam: { id: string } }>("/api/jams/join", {
        method: "POST",
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      window.location.href = `/jam/${res.jam.id}`;
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
            <AudioLines className="h-8 w-8 text-cream" /> Jam
          </h1>
          <p className="mt-1 text-sm text-mist">
            Listen together in real time — the host controls the music, everyone chats.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-full bg-cream px-5 py-2.5 font-bold text-ink transition-transform hover:scale-105"
        >
          <Plus className="h-5 w-5" /> Host a Jam
        </button>
      </div>

      {/* Join by code */}
      <form
        onSubmit={join}
        className="flex flex-col gap-3 rounded-3xl border border-ink/40 bg-panel p-5 sm:flex-row sm:items-center"
      >
        <LogIn className="hidden h-5 w-5 shrink-0 text-midgrey sm:block" />
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="ENTER INVITE CODE (E.G. K7QP2M)"
          maxLength={6}
          className="flex-1 rounded-full border border-softwhite/15 bg-brand-deep/50 px-5 py-3 tracking-[0.2em] font-bold uppercase placeholder:tracking-normal placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={joinBusy || !joinCode.trim()}
          className="rounded-full bg-brand px-6 py-3 font-bold text-softwhite transition-transform hover:scale-105 disabled:opacity-50"
        >
          {joinBusy ? "Joining…" : "Join Jam"}
        </button>
      </form>

      {/* My jams */}
      {jams === null ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-8 w-8" />
        </div>
      ) : jams.length === 0 ? (
        <EmptyState
          icon={<Radio className="h-10 w-10" />}
          title="No active jams"
          subtitle="Host a Jam and share the invite code with friends — they join instantly and hear what you play, in sync."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jams.map((j) => (
            <Link
              key={j.id}
              href={`/jam/${j.id}`}
              className="group rounded-3xl border border-ink/40 bg-panel p-5 transition-colors hover:bg-softwhite/5"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-deep px-3 py-1 text-xs font-bold tracking-widest text-mist">
                  {j.code}
                </span>
                {j.isPlaying && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-cream">
                    <span className="groove-pulse h-2 w-2 rounded-full bg-cream" /> LIVE
                  </span>
                )}
              </div>
              <div className="mt-3 text-lg font-bold">{j.name}</div>
              <div className="text-sm text-midgrey">Hosted by {j.hostName}</div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Host a new Jam">
        <form onSubmit={create} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">Jam name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Friday night mix"
              autoFocus
              className="w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 text-softwhite placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
          </label>
          <p className="text-sm text-midgrey">
            You become the host: everything you play streams to everyone in the Jam, in sync.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cream py-3 font-bold text-ink disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4 border-ink/30 border-t-ink" />}
            Start Jamming
          </button>
        </form>
      </Modal>
    </div>
  );
}
