"use client";

import { Heart, ListMusic, MoreHorizontal, Play, Plus, Radio, Share2, Trash2, User2, Ban } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client";
import { usePlayer, useToast } from "@/components/providers";
import { Modal } from "@/components/modal";
import type { SongDTO } from "@/lib/types";

interface SimplePlaylist {
  id: string;
  name: string;
  songCount: number;
}

/**
 * Spotify-style 3-dot song menu for web.
 * Options: play next, add to queue, add to playlist, like,
 * remove from taste profile, view artist, share.
 */
export function SongContextMenu({
  song,
  playlistId,
  onSongRemoved,
}: {
  song: SongDTO;
  playlistId?: string;
  onSongRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "playlists">("menu");
  const [playlists, setPlaylists] = useState<SimplePlaylist[]>([]);
  const player = usePlayer();
  const { toast } = useToast();

  const loadPlaylists = async () => {
    try {
      const res = await api<{ playlists: SimplePlaylist[] }>("/api/playlists");
      setPlaylists(res.playlists ?? []);
    } catch {
      setPlaylists([]);
    }
  };

  const handlePlayNext = () => {
    if (player.current && player.isPlaying) {
      const q = [...player.queue];
      const idx = q.findIndex((s) => s.id === player.current?.id);
      q.splice(idx + 1, 0, song);
      player.playSong(song, q);
      toast("Playing next", "success");
    } else {
      player.playSong(song, [song]);
    }
    setOpen(false);
  };

  const handleAddToQueue = () => {
    const q = [...player.queue, song];
    if (!player.current) player.playSong(song, q);
    else player.playSong(player.current, q);
    toast("Added to queue", "success");
    setOpen(false);
  };

  const handleLike = async () => {
    try {
      if (song.liked) {
        await api(`/api/songs/${song.id}/like`, { method: "DELETE" });
        song.liked = false;
        toast("Removed from Liked Songs");
      } else {
        await api(`/api/songs/${song.id}/like`, { method: "PUT" });
        song.liked = true;
        toast("Added to Liked Songs", "success");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setOpen(false);
  };

  const handleRemoveFromTaste = async () => {
    try {
      await api(`/api/songs/${song.id}/like`, { method: "DELETE" });
      toast("Removed from taste profile — won't recommend this again", "info");
    } catch {}
    setOpen(false);
  };

  const handleAddToPlaylist = async (plId: string, plName: string) => {
    try {
      await api(`/api/playlists/${plId}/songs`, { method: "POST", body: JSON.stringify({ songId: song.id }) });
      toast(`Added to "${plName}"`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setOpen(false);
  };

  const handleRemoveFromPlaylist = async () => {
    if (!playlistId) return;
    try {
      await api(`/api/playlists/${playlistId}/songs?songId=${song.id}`, { method: "DELETE" });
      onSongRemoved?.();
      toast("Removed from playlist", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setOpen(false);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/track/${song.id}`
      );
      toast("Link copied to clipboard", "success");
    } catch {}
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          setMode("menu");
          void loadPlaylists();
        }}
        aria-label="More options"
        className="rounded-full p-2 text-midgrey opacity-0 transition-opacity hover:text-softwhite group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="" wide={false}>
        {mode === "playlists" ? (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">Add to playlist</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => handleAddToPlaylist(pl.id, pl.name)}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-softwhite/5"
                >
                  <ListMusic className="h-5 w-5 text-cream" />
                  <div className="flex-1">
                    <p className="font-semibold">{pl.name}</p>
                    <p className="text-xs text-midgrey">{pl.songCount} songs</p>
                  </div>
                  <Plus className="h-4 w-4 text-midgrey" />
                </button>
              ))}
              {playlists.length === 0 && (
                <p className="py-4 text-center text-sm text-midgrey">No playlists yet — create one from your Library.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="mb-3 truncate text-sm font-bold text-mist">{song.title}</p>
            <MenuItem icon={Play} label="Play next" onClick={handlePlayNext} />
            <MenuItem icon={Plus} label="Add to queue" onClick={handleAddToQueue} />
            <MenuItem icon={ListMusic} label="Add to playlist…" onClick={() => setMode("playlists")} />
            <MenuItem icon={Heart} label={song.liked ? "Unlike" : "Like"} onClick={handleLike} />
            <MenuItem icon={Ban} label="Remove from taste profile" onClick={handleRemoveFromTaste} />
            {playlistId && (
              <MenuItem icon={Trash2} label="Remove from this playlist" danger onClick={handleRemoveFromPlaylist} />
            )}
            <MenuItem icon={Share2} label="Share" onClick={handleShare} />
          </div>
        )}
      </Modal>
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
        danger ? "text-red-300 hover:bg-red-400/10" : "text-softwhite hover:bg-softwhite/5"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
