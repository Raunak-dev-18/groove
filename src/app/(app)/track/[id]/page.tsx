"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, Music4, Play, Pause } from "lucide-react";
import { getSong } from "@/lib/song-cache";
import { api } from "@/lib/client";
import { usePlayer, useToast } from "@/components/providers";
import { Artwork } from "@/components/artwork";
import { Avatar } from "@/components/avatar";
import { SongRow } from "@/components/song-row";
import { Rail, Section } from "@/components/section";
import { SongCard } from "@/components/song-card";
import { EmptyState, Spinner } from "@/components/skeletons";
import { formatCount, formatDuration } from "@/lib/utils";
import type { SongDTO } from "@/lib/types";

/** /track/[id] — dedicated song page. Data is prefetched on hover from lists. */
export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const player = usePlayer();
  const { toast } = useToast();
  const [song, setSong] = useState<SongDTO | null | "loading">("loading");
  const [more, setMore] = useState<SongDTO[]>([]);

  useEffect(() => {
    let alive = true;
    setSong("loading");
    setMore([]);
    getSong(id).then((s) => {
      if (!alive) return;
      setSong(s);
      if (s) {
        // more from the primary artist
        api<{ items: SongDTO[] }>(`/api/songs?artistId=${s.primaryArtist.id}&sort=popular&limit=10`)
          .then((r) => alive && setMore(r.items.filter((x) => x.id !== s.id)))
          .catch(() => {});
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const like = async () => {
    if (!song || song === "loading") return;
    try {
      if (song.liked) {
        await api(`/api/songs/${song.id}/like`, { method: "DELETE" });
        song.liked = false;
      } else {
        await api(`/api/songs/${song.id}/like`, { method: "PUT" });
        song.liked = true;
      }
      setSong({ ...song });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (song === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!song) {
    return <EmptyState icon={<Music4 className="h-10 w-10" />} title="Track not found" subtitle="It may have been removed." />;
  }

  const isCurrent = player.current?.id === song.id;
  const isPlayingThis = isCurrent && player.isPlaying;

  return (
    <div className="space-y-10">
      {/* hero */}
      <div className="flex flex-col items-center gap-6 rounded-3xl border border-ink/40 bg-panel p-6 sm:flex-row sm:p-8">
        <Artwork fileId={song.coverFileId} alt={song.title} className="aspect-square w-full sm:w-56" />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-semibold tracking-wide text-midgrey uppercase">Track</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{song.title}</h1>
          <p className="mt-2 text-mist">
            {song.artists.map((a, i) => (
              <span key={a.id} className="mr-3 inline-flex items-center gap-2 align-middle">
                {i > 0 && <span className="sr-only">, </span>}
                <Link href={`/artists/${a.id}`} className="inline-flex items-center gap-2 rounded-full bg-brand-deep/60 py-1 pr-3 pl-1 transition-colors hover:bg-softwhite/10">
                  <Avatar name={a.name} image={a.avatarFileId} className="h-6 w-6" />
                  <span className="font-semibold text-cream">{a.name}</span>
                  {a.role === "featured" && <span className="text-[10px] font-bold tracking-wide text-midgrey uppercase">feat.</span>}
                </Link>
              </span>
            ))}
          </p>
          <p className="mt-1 text-sm text-midgrey">
            {formatDuration(song.durationSec)} · {formatCount(song.plays)} plays
            {song.genre && <> · {song.genre}</>}
          </p>
          {song.description && (
            <p className="mt-3 max-w-xl text-sm text-mist">{song.description}</p>
          )}
          <div className="mt-5 flex items-center justify-center gap-3 sm:justify-start">
            <button
              type="button"
              onClick={() =>
                isPlayingThis ? player.toggle() : player.playSong(song, [song, ...more])
              }
              className="flex items-center gap-2 rounded-full bg-cream px-7 py-3 font-bold text-ink transition-transform hover:scale-105"
            >
              {isPlayingThis ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="h-5 w-5" fill="currentColor" />
              )}
              {isPlayingThis ? "Pause" : "Play track"}
            </button>
            <button
              type="button"
              onClick={like}
              aria-label={song.liked ? "Unlike" : "Like"}
              className={`rounded-full border p-3 transition-colors ${
                song.liked
                  ? "border-cream/60 text-cream"
                  : "border-softwhite/20 text-midgrey hover:text-softwhite"
              }`}
            >
              <Heart className="h-5 w-5" fill={song.liked ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>

      {/* more from the artist */}
      {more.length > 0 && (
        <Section title={`More from ${song.primaryArtist.name}`} href={`/artists/${song.primaryArtist.id}`}>
          <Rail>
            {more.map((s) => (
              <SongCard key={s.id} song={s} queue={more} />
            ))}
          </Rail>
        </Section>
      )}

      {/* compact list of the same */}
      {more.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Popular on Groove</h2>
          <div>
            {more.slice(0, 8).map((s, i) => (
              <SongRow key={s.id} song={s} queue={more} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
