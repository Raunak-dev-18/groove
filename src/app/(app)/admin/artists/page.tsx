"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users2 } from "lucide-react";
import dynamic from "next/dynamic";
import { api } from "@/lib/client";
import { useToast } from "@/components/providers";
import { useSession } from "@/lib/auth-client";
import { Avatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { Spinner, EmptyState, SkeletonRowList } from "@/components/skeletons";
import type { ArtistDTO } from "@/lib/types";

// lazy-loaded chunk — only admins ever need the upload machinery
const ImagePicker = dynamic(
  () => import("@/components/image-picker").then((m) => ({ default: m.ImagePicker })),
  {
    ssr: false,
    loading: () => <div className="groove-skeleton h-22 w-full" />,
  },
);

interface FormState {
  name: string;
  genre: string;
  bio: string;
  country: string;
  avatarFileId: string | null;
}

const EMPTY: FormState = { name: "", genre: "", bio: "", country: "", avatarFileId: null };

export default function AdminArtistsPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const canEdit = ["manager", "admin", "super_admin"].includes(
    (session?.user as { role?: string })?.role ?? "user",
  );
  const [artists, setArtists] = useState<ArtistDTO[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ArtistDTO | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // fetch every page — the admin panel must show the whole roster
      const all: ArtistDTO[] = [];
      let offset = 0;
      for (let page = 0; page < 10; page++) {
        const r = await api<{ items: ArtistDTO[]; nextOffset: number | null }>(
          `/api/artists?limit=200&offset=${offset}`,
        );
        all.push(...r.items);
        if (r.nextOffset == null) break;
        offset = r.nextOffset;
      }
      setArtists(all);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (a: ArtistDTO) => {
    setEditing(a);
    setForm({
      name: a.name,
      genre: a.genre,
      bio: a.bio,
      country: a.country ?? "",
      avatarFileId: a.avatarFileId,
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/artists/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast("Artist updated", "success");
      } else {
        await api("/api/artists", { method: "POST", body: JSON.stringify(form) });
        toast("Artist created", "success");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: ArtistDTO) => {
    if (!confirm(`Delete "${a.name}" and all their songs? This cannot be undone.`)) return;
    setDeleting(a.id);
    try {
      await api(`/api/artists/${a.id}`, { method: "DELETE" });
      toast("Artist deleted", "success");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Artists</h1>
          <p className="mt-1 text-sm text-mist">Create artists, upload avatars, write their details.</p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-full bg-cream px-5 py-2.5 font-bold text-ink transition-transform hover:scale-105"
          >
            <Plus className="h-5 w-5" /> New artist
          </button>
        )}
      </div>

      {artists === null ? (
        <SkeletonRowList count={5} />
      ) : artists.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-10 w-10" />}
          title="No artists yet"
          subtitle="Create your first artist, then upload their songs."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-ink/40 bg-panel">
          {artists.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-4 border-b border-softwhite/5 px-4 py-3 last:border-0 sm:px-6"
            >
              <Avatar name={a.name} image={a.avatarFileId} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.name}</p>
                <p className="truncate text-sm text-midgrey">
                  {a.genre || "No genre"} · {a.followers} followers
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => openEdit(a)}
                  aria-label="Edit artist"
                  className="rounded-full p-2 text-midgrey hover:bg-softwhite/10 hover:text-softwhite"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => remove(a)}
                  disabled={deleting === a.id}
                  aria-label="Delete artist"
                  className="rounded-full p-2 text-midgrey hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40"
                >
                  {deleting === a.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* create / edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit artist" : "New artist"}>
        <form onSubmit={save} className="space-y-4">
          <ImagePicker
            label="Avatar (upload or paste an image URL)"
            value={form.avatarFileId}
            onChange={(v) => setForm((f) => ({ ...f, avatarFileId: v }))}
            round
            size={84}
          />

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">Name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Artist or band name"
              className="w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">Genre</span>
            <input
              value={form.genre}
              onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
              placeholder="Pop, Indie, Hip hop…"
              className="w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">Country / region (optional)</span>
            <input
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
              maxLength={2}
              placeholder="e.g. IN, US, BR — powers region discovery for new users"
              className="w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 uppercase placeholder:normal-case placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">Bio</span>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={3}
              placeholder="A few lines about the artist…"
              className="w-full resize-none rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cream py-3 font-bold text-ink disabled:opacity-60"
          >
            {saving && <Spinner className="h-4 w-4 border-ink/30 border-t-ink" />}
            {editing ? "Save changes" : "Create artist"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
