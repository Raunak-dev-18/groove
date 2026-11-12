"use client";

import { useCallback, useEffect, useState } from "react";
import { Music4, Pencil, Plus, Trash2, Upload, FolderOpen, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { api, uploadFile } from "@/lib/client";
import { useToast } from "@/components/providers";
import { useSession } from "@/lib/auth-client";
import { Artwork } from "@/components/artwork";
import { ArtistsSelect } from "@/components/artists-select";
import { Modal } from "@/components/modal";
import { Spinner, EmptyState, SkeletonRowList } from "@/components/skeletons";
import { formatCount, formatDuration } from "@/lib/utils";
import { autoDescription, parseSongFilename } from "@/lib/filename";
import { songDuplicateKey } from "@/lib/duplicate";
import type { ArtistDTO, SongDTO } from "@/lib/types";

// lazy-loaded chunk — only admins ever need the upload machinery
const ImagePicker = dynamic(
  () => import("@/components/image-picker").then((m) => ({ default: m.ImagePicker })),
  {
    ssr: false,
    loading: () => <div className="groove-skeleton h-20 w-full" />,
  },
);

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Read a file's audio duration via a throwaway <audio> element. */
function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      a.preload = "metadata";
      a.src = url;
      a.onloadedmetadata = () => {
        const d = a.duration || 0;
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) ? d : 0);
      };
      a.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    } catch {
      resolve(0);
    }
  });
}

const AUDIO_RE = /\.(mp3|wav|m4a|flac|ogg|aac|opus|wma)$/i;

interface BulkItem {
  file: File;
  title: string;
  artist: string;
  featured: string[];
  description: string;
  duration: number;
  status: "pending" | "uploading" | "done" | "error";
  pct: number;
  error?: string;
  /** Set when this title+artist already exists in the library or queue — upload skips it */
  duplicate?: { existingTitle: string; existingArtist: string; inQueue?: boolean } | null;
}

export default function AdminSongsPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const canEdit = ["manager", "admin", "super_admin"].includes(
    (session?.user as { role?: string })?.role ?? "user",
  );
  const [songs, setSongs] = useState<SongDTO[] | null>(null);
  const [artists, setArtists] = useState<ArtistDTO[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // single upload / edit form (shared)
  const [editing, setEditing] = useState<SongDTO | null>(null);
  const [title, setTitle] = useState("");
  const [artistIds, setArtistIds] = useState<string[]>([]); // ordered; [0] = primary
  const [artistExtras, setArtistExtras] = useState<string[]>([]); // new names to create
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [audioFileId, setAudioFileId] = useState<string | null>(null);
  const [audioPct, setAudioPct] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [coverFileId, setCoverFileId] = useState<string | null>(null);

  // bulk upload
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // fetch every page — the admin panel must show the whole library
      const all: SongDTO[] = [];
      let offset = 0;
      for (let page = 0; page < 10; page++) {
        const r = await api<{ items: SongDTO[]; nextOffset: number | null }>(
          `/api/songs?limit=200&sort=new&offset=${offset}`,
        );
        all.push(...r.items);
        if (r.nextOffset == null) break;
        offset = r.nextOffset;
      }
      setSongs(all);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadArtists = useCallback(async () => {
    try {
      // fetch every page so the artist dropdown always shows the full roster
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
    } catch {
      /* artist picker degrades to an empty list */
    }
  }, []);

  useEffect(() => {
    load();
    loadArtists();
  }, [load, loadArtists]);

  const reset = () => {
    setEditing(null);
    setTitle("");
    setArtistIds([]);
    setArtistExtras([]);
    setGenre("");
    setDescription("");
    setAudioFileId(null);
    setAudioDuration(0);
    setCoverFileId(null);
    setAudioPct(null);
  };

  const openCreate = () => {
    reset();
    setOpen(true);
  };

  const NIL_ARTIST_ID = "00000000-0000-0000-0000-000000000000";

  const openEdit = (s: SongDTO) => {
    reset();
    void loadArtists(); // fresh dropdown — never offer deleted artists
    setEditing(s);
    setTitle(s.title);
    // ordered: primary first, then featured — never the "Unknown Artist" placeholder
    const primaryId = s.primaryArtist.id !== NIL_ARTIST_ID ? s.primaryArtist.id : "";
    const featured = s.artists
      .filter((a) => a.role === "featured" && a.id !== primaryId && a.id !== NIL_ARTIST_ID)
      .map((a) => a.id);
    setArtistIds([primaryId, ...featured].filter(Boolean));
    if (!primaryId) setArtistExtras([]); // placeholder can't be re-sent
    setGenre(s.genre);
    setDescription(s.description);
    setCoverFileId(s.coverFileId);
    setAudioDuration(s.durationSec);
    setOpen(true);
  };

  /* ---------------- single upload: audio pick + auto-fill ---------------- */

  const uploadAudio = async (file: File) => {
    if (!file.type.startsWith("audio/") && !AUDIO_RE.test(file.name)) {
      toast("Please pick an audio file (mp3, wav, m4a…)", "error");
      return;
    }
    // auto-detect title + artists from the filename
    const meta = parseSongFilename(file.name, artists.map((a) => a.name));
    if (!title) setTitle(meta.title);
    const ids: string[] = [];
    const extra: string[] = [];
    for (const name of [meta.primaryArtist, ...meta.featured].filter(Boolean)) {
      const match = artists.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (match) ids.push(match.id);
      else extra.push(name);
    }
    setArtistIds(ids);
    setArtistExtras(extra);
    if (!description) setDescription(autoDescription(meta));

    probeDuration(file).then((d) => d > 0 && setAudioDuration(d));

    setAudioPct(0);
    try {
      const res = await uploadFile(file, setAudioPct);
      if (res.fallback) toast(res.warning ?? "Stored in local fallback storage", "info");
      setAudioFileId(res.id);
      toast("Audio uploaded", "success");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("413") || msg.toLowerCase().includes("too large")) {
        toast(
          "File too large for this connection. If you're on the Codespace URL, switch to the Cloudflare tunnel URL — the Codespace proxy caps uploads. The tunnel has no such limit.",
          "error",
        );
      } else {
        toast(msg, "error");
      }
    } finally {
      setAudioPct(null);
    }
  };

  const uploadCover = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("Please pick an image file", "error");
      return;
    }
    try {
      const res = await uploadFile(file, () => {});
      if (res.fallback) toast(res.warning ?? "Stored in local fallback storage", "info");
      setCoverFileId(res.id);
      toast("Cover uploaded", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!title.trim() || (artistIds.length === 0 && artistExtras.length === 0)) {
      toast("Title and at least one artist are required", "error");
      return;
    }
    if (!editing && !audioFileId) {
      toast("Audio file is required", "error");
      return;
    }
    setSaving(true);
    try {
      const primaryId = artistIds[0];
      const primaryExtra = !primaryId ? artistExtras[0] : undefined;
      const featuredIds = artistIds.slice(1);
      const featuredExtras = primaryId ? artistExtras : artistExtras.slice(1);

      const body: Record<string, unknown> = {
        title: title.trim(),
        primaryArtistId: primaryId,
        primaryArtistName: primaryExtra,
        featuredArtistIds: featuredIds,
        featuredArtistNames: featuredExtras,
        genre: genre.trim(),
        description: description.trim(),
        coverFileId,
        durationSec: audioDuration,
      };

      if (editing) {
        await api(`/api/songs/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Song updated", "success");
      } else {
        await api("/api/songs", { method: "POST", body: JSON.stringify({ ...body, audioFileId }) });
        toast("Song published!", "success");
      }
      setOpen(false);
      reset();
      load();
      loadArtists(); // artists may have been auto-created
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: SongDTO) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    setDeleting(s.id);
    try {
      await api(`/api/songs/${s.id}`, { method: "DELETE" });
      toast("Song deleted", "success");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(null);
    }
  };

  /* ---------------- bulk upload ---------------- */

  /** Re-flag duplicates inside the queue itself (same title + artist twice). */
  const recomputeQueueDupes = (items: BulkItem[]): BulkItem[] => {
    const seen = new Map<string, { title: string; artist: string }>();
    return items.map((it) => {
      if (it.status === "done") return it;
      const key = songDuplicateKey(it.title, it.artist);
      const titlePart = key.split("::")[0];
      if (!titlePart) {
        // no usable title — clear any stale queue flag, keep library flag
        return it.duplicate?.inQueue ? { ...it, duplicate: null } : it;
      }
      const first = seen.get(key);
      if (first) {
        return {
          ...it,
          duplicate: { existingTitle: first.title, existingArtist: first.artist, inQueue: true },
        };
      }
      seen.set(key, { title: it.title, artist: it.artist });
      return it.duplicate?.inQueue ? { ...it, duplicate: null } : it;
    });
  };

  const removeBulkItem = (idx: number) => {
    if (bulkBusy && bulkItems[idx]?.status === "uploading") return;
    setBulkItems((prev) => recomputeQueueDupes(prev.filter((_, i) => i !== idx)));
  };

  const addBulkFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const artistNames = artists.map((a) => a.name);
    const items: BulkItem[] = [];
    for (const f of Array.from(fileList)) {
      if (!f.type.startsWith("audio/") && !AUDIO_RE.test(f.name)) continue;
      const folder = (f as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0];
      const meta = parseSongFilename(f.name, artistNames, folder);
      const duration = await probeDuration(f);
      items.push({
        file: f,
        title: meta.title,
        artist: meta.primaryArtist,
        featured: meta.featured,
        description: autoDescription(meta),
        duration,
        status: "pending",
        pct: 0,
        duplicate: null,
      });
    }
    if (items.length === 0) {
      toast("No audio files found in that selection", "error");
      return;
    }
    // merge, then flag queue duplicates in one pass
    setBulkItems((prev) => recomputeQueueDupes([...prev, ...items]));
    setBulkOpen(true);
    // async check against the library (flags land when results arrive)
    void fetchLibraryDupes(items);
  };

  const patchItem = (idx: number, patch: Partial<BulkItem>) =>
    setBulkItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  /** Edit title/artist — clears the duplicate flag and re-flags queue dupes. */
  const editBulkMeta = (idx: number, patch: Partial<BulkItem>) => {
    setBulkItems((prev) =>
      recomputeQueueDupes(prev.map((it, i) => (i === idx ? { ...it, ...patch, duplicate: null } : it))),
    );
  };

  /** Check items against the library. Returns a map of item → existing song, and applies flags. */
  const fetchLibraryDupes = async (items: BulkItem[]) => {
    try {
      const res = await api<{ duplicates: { index: number; existing: { title: string; artist: string } }[] }>(
        "/api/songs/check-duplicates",
        {
          method: "POST",
          body: JSON.stringify({ songs: items.map((i) => ({ title: i.title, artist: i.artist })) }),
        },
      );
      const byItem = new Map<BulkItem, { title: string; artist: string }>();
      for (const d of res.duplicates) {
        const it = items[d.index];
        if (it) byItem.set(it, d.existing);
      }
      setBulkItems((prev) =>
        prev.map((it) => {
          if (it.duplicate?.inQueue) return it;
          const existing = byItem.get(it);
          if (existing) return { ...it, duplicate: { existingTitle: existing.title, existingArtist: existing.artist } };
          return it.duplicate ? { ...it, duplicate: null } : it;
        }),
      );
      return byItem;
    } catch {
      return new Map<BulkItem, { title: string; artist: string }>();
    }
  };

  const startBulk = async () => {
    if (bulkBusy) return;
    const pendingAll = bulkItems.filter((i) => i.status !== "done");
    const uploadable = pendingAll.filter((i) => !i.duplicate);
    if (pendingAll.length === 0) return;
    if (uploadable.length === 0) {
      toast("Every queued song is a duplicate — nothing to upload. Remove or rename the flagged items.", "info");
      return;
    }
    setBulkBusy(true);
    // fresh check right before upload — catches edits and new library songs
    const freshDupes = await fetchLibraryDupes(pendingAll);
    let okCount = 0;
    let failCount = 0;
    let skippedDupes = 0;
    for (let idx = 0; idx < bulkItems.length; idx++) {
      const item = bulkItems[idx];
      if (item.status === "done") continue;
      if (item.duplicate?.inQueue || freshDupes.has(item)) {
        skippedDupes++;
        continue;
      }
      if (!item.title.trim() || !item.artist.trim()) {
        patchItem(idx, { status: "error", error: "needs a title and artist" });
        failCount++;
        continue;
      }
      patchItem(idx, { status: "uploading", pct: 0, error: undefined });
      try {
        const up = await uploadFile(item.file, (pct) => patchItem(idx, { pct }));
        await api("/api/songs", {
          method: "POST",
          body: JSON.stringify({
            title: item.title.trim(),
            primaryArtistName: item.artist.trim(),
            featuredArtistNames: item.featured,
            audioFileId: up.id,
            durationSec: item.duration,
            description: item.description,
          }),
        });
        patchItem(idx, { status: "done", pct: 100 });
        okCount++;
      } catch (e) {
        const msg = (e as Error).message;
        patchItem(idx, { status: "error", error: msg });
        failCount++;
      }
    }
    setBulkBusy(false);
    const skippedNote = skippedDupes ? `, ${skippedDupes} duplicate${skippedDupes === 1 ? "" : "s"} skipped` : "";
    toast(
      `Bulk upload finished — ${okCount} song(s) added${failCount ? `, ${failCount} failed` : ""}${skippedNote}`,
      failCount ? "info" : "success",
    );
    load();
    loadArtists(); // artists may have been auto-created
  };

  const bulkDone = bulkItems.filter((i) => i.status === "done").length;
  const bulkDupes = bulkItems.filter((i) => i.status !== "done" && i.duplicate).length;
  const bulkUploadable = bulkItems.filter((i) => i.status !== "done" && !i.duplicate).length;

  /* ---------------- render ---------------- */

  const inputCls =
    "w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 placeholder:text-midgrey focus:border-cream/60 focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Songs</h1>
          <p className="mt-1 text-sm text-mist">
            Filenames auto-detect the song + artists — bulk upload a whole folder and everything fills in.
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-softwhite/25 px-5 py-2.5 font-bold text-mist transition-colors hover:bg-softwhite/10">
                <FolderOpen className="h-5 w-5" />
                Bulk upload
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addBulkFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 rounded-full bg-cream px-5 py-2.5 font-bold text-ink transition-transform hover:scale-105"
              >
                <Plus className="h-5 w-5" /> Upload song
              </button>
            </>
          )}
        </div>
      </div>

      {songs === null ? (
        <SkeletonRowList count={6} />
      ) : songs.length === 0 ? (
        <EmptyState
          icon={<Music4 className="h-10 w-10" />}
          title="No songs yet"
          subtitle="Upload the first track — it appears on Home instantly."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-ink/40 bg-panel">
          {songs.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 border-b border-softwhite/5 px-4 py-3 last:border-0 sm:px-6"
            >
              <Artwork fileId={s.coverFileId} alt={s.title} className="h-12 w-12" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.title}</p>
                <p className="truncate text-sm text-midgrey">
                  {s.artists.map((a) => a.name).join(", ")}
                </p>
              </div>
              <span className="hidden text-sm text-midgrey tabular-nums sm:block">
                {formatDuration(s.durationSec)}
              </span>
              <span className="text-sm font-bold text-cream tabular-nums">
                {formatCount(s.plays)}
              </span>
              {canEdit && (
                <button
                  onClick={() => openEdit(s)}
                  aria-label="Edit song"
                  className="rounded-full p-2 text-midgrey hover:bg-softwhite/10 hover:text-softwhite"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => remove(s)}
                  disabled={deleting === s.id}
                  aria-label="Delete song"
                  className="rounded-full p-2 text-midgrey hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40"
                >
                  {deleting === s.id ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------------- upload / edit song modal ---------------- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit “${editing.title}”` : "Upload a song"}
        wide
      >
        <form onSubmit={save} className="space-y-4">
          {/* audio upload (create only — edits keep the existing file) */}
          {!editing && (
            <div className="rounded-2xl border border-softwhite/10 bg-brand-deep/30 p-4">
              <p className="mb-2 text-sm font-semibold text-mist">Audio file (required)</p>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => e.target.files?.[0] && uploadAudio(e.target.files[0])}
                className="w-full text-sm text-midgrey file:mr-3 file:rounded-full file:border-0 file:bg-cream file:px-4 file:py-2 file:font-bold file:text-ink"
              />
              {audioPct !== null && (
                <div className="mt-3 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-softwhite/10">
                    <div className="h-full bg-cream transition-[width]" style={{ width: `${audioPct}%` }} />
                  </div>
                  <p className="text-xs text-midgrey">Uploading… {audioPct}%</p>
                </div>
              )}
              {audioFileId && audioPct === null && (
                <p className="mt-2 text-xs font-semibold text-cream">
                  ✓ Uploaded{audioDuration > 0 && ` · ${formatDuration(audioDuration)}`}
                </p>
              )}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">
              Song name{!editing && " (auto-detected from the file)"}
            </span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Track title"
              className={inputCls}
            />
          </label>

          {/* artists — searchable dropdown with avatars, multi-select, new names creatable */}
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-mist">
              Artists <span className="text-cream">— first pick is the primary, the rest are featured</span>
            </span>
            <ArtistsSelect
              artists={artists}
              selectedIds={artistIds}
              onChange={setArtistIds}
              extraNames={artistExtras}
              onExtraNamesChange={setArtistExtras}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-mist">Genre</span>
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g. Lo-fi"
                className={inputCls}
              />
            </label>

            <div className="sm:col-span-1">
              <ImagePicker
                label="Cover art (upload or paste an image URL)"
                value={coverFileId}
                onChange={setCoverFileId}
                size={72}
              />
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-mist">Description (auto-generated)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Anything about this track…"
              className="w-full resize-none rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={saving || (!editing && !audioFileId) || !title.trim() || (artistIds.length === 0 && artistExtras.length === 0)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cream py-3 font-bold text-ink disabled:opacity-60"
          >
            {saving ? <Spinner /> : null}
            {editing ? "Save changes" : "Publish song"}
          </button>
        </form>
      </Modal>

      {/* ---------------- bulk upload modal ---------------- */}
      <Modal
        open={bulkOpen}
        onClose={() => (bulkBusy ? toast("Upload in progress…", "info") : setBulkOpen(false))}
        title={`Bulk upload${bulkItems.length ? ` — ${bulkDone}/${bulkItems.length} done` : ""}`}
        wide
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-softwhite/25 px-4 py-2 text-sm font-bold text-mist hover:bg-softwhite/10">
              <FolderOpen className="h-4 w-4" /> Add more files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addBulkFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-xs text-midgrey">
              Titles + artists are auto-detected from filenames (and folder names). Fix anything below, then start.
            </p>
          </div>

          {bulkItems.length === 0 ? (
            <EmptyState
              icon={<Upload className="h-10 w-10" />}
              title="Nothing queued"
              subtitle="Pick some audio files or a folder to fill this list."
            />
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {bulkItems.map((item, idx) => (
                <div
                  key={`${item.file.name}-${idx}`}
                  className={`rounded-2xl border p-3 ${
                    item.duplicate
                      ? "border-amber-300/40 bg-amber-400/5"
                      : "border-softwhite/10 bg-brand-deep/40"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-midgrey" title={item.file.name}>
                      {item.file.name}
                    </p>
                    {item.status !== "uploading" && (
                      <button
                        type="button"
                        onClick={() => removeBulkItem(idx)}
                        aria-label="Remove from queue"
                        title={item.status === "done" ? "Remove from list" : "Remove from queue"}
                        className="shrink-0 rounded-full p-1 text-midgrey hover:bg-red-400/10 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {item.duplicate && (
                    <div className="mb-2 flex items-start gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {item.duplicate.inQueue
                          ? "Same song is queued again in this batch."
                          : `"${item.duplicate.existingTitle}" by ${item.duplicate.existingArtist} is already in your library.`}{" "}
                        It will be skipped — rename it or remove it.
                      </span>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={item.title}
                      disabled={item.status === "done"}
                      onChange={(e) => editBulkMeta(idx, { title: e.target.value })}
                      placeholder="Song name"
                      className="rounded-xl border border-softwhite/15 bg-panel px-3 py-2 text-sm disabled:opacity-50"
                    />
                    <input
                      value={item.artist}
                      disabled={item.status === "done"}
                      onChange={(e) => editBulkMeta(idx, { artist: e.target.value })}
                      placeholder="Primary artist (new ones are created)"
                      className="rounded-xl border border-softwhite/15 bg-panel px-3 py-2 text-sm disabled:opacity-50"
                    />
                  </div>
                  {item.featured.length > 0 && (
                    <p className="mt-2 text-xs text-mist">
                      feat. {item.featured.join(", ")} <span className="text-midgrey">(auto-detected)</span>
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {item.status === "uploading" && (
                        <div className="h-1 w-full overflow-hidden rounded-full bg-softwhite/10">
                          <div className="h-full bg-cream transition-[width]" style={{ width: `${item.pct}%` }} />
                        </div>
                      )}
                      {item.status === "error" && (
                        <p className="truncate text-xs text-red-300">{item.error}</p>
                      )}
                    </div>
                    <span className="shrink-0">
                      {item.status === "pending" && <span className="text-xs text-midgrey">waiting</span>}
                      {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-cream" />}
                      {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-cream" />}
                      {item.status === "error" && <AlertTriangle className="h-4 w-4 text-red-300" />}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={startBulk}
            disabled={bulkBusy || bulkUploadable === 0}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cream py-3 font-bold text-ink disabled:opacity-50"
          >
            {bulkBusy ? <Spinner /> : <Upload className="h-4 w-4" />}
            {bulkBusy
              ? "Uploading…"
              : bulkUploadable === 0 && bulkDupes > 0
                ? "All queued songs are duplicates"
                : `Upload ${bulkUploadable} song(s)${bulkDupes ? ` — skip ${bulkDupes} duplicate${bulkDupes === 1 ? "" : "s"}` : ""}`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
