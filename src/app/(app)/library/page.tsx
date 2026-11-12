"use client";

import { useEffect, useState } from "react";
import { Heart, Library as LibraryIcon, Link2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useFeedVersion } from "@/hooks/use-feed";
import { SongRow } from "@/components/song-row";
import { ArtistCard } from "@/components/artist-card";
import { Rail } from "@/components/section";
import { EmptyState, SkeletonRowList } from "@/components/skeletons";
import type { ArtistDTO, SongDTO } from "@/lib/types";

interface LibraryData {
  likedSongs: SongDTO[];
  followingArtists: ArtistDTO[];
  blends: { id: string; name: string; code: string; ownerName: string }[];
  jams: { id: string; name: string; code: string }[];
}

export default function LibraryPage() {
  const [data, setData] = useState<LibraryData | null>(null);
  const { refreshKey } = useFeedVersion();

  useEffect(() => {
    api<LibraryData>("/api/library").then(setData).catch(() => {});
  }, [refreshKey]);

  if (!data) return <SkeletonRowList count={8} />;

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Your library</h1>

      {/* Liked songs */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Heart className="h-5 w-5 text-cream" fill="currentColor" /> Liked songs
          <span className="text-sm font-medium text-midgrey">{data.likedSongs.length}</span>
        </h2>
        {data.likedSongs.length > 0 ? (
          <div>
            {data.likedSongs.slice(0, 10).map((s, i) => (
              <SongRow key={s.id} song={s} queue={data.likedSongs} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Heart className="h-10 w-10" />}
            title="Nothing liked yet"
            subtitle="Tap the heart on any track and it lands here."
          />
        )}
      </section>

      {/* Following */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <LibraryIcon className="h-5 w-5 text-cream" /> Following
          <span className="text-sm font-medium text-midgrey">{data.followingArtists.length}</span>
        </h2>
        {data.followingArtists.length > 0 ? (
          <Rail>
            {data.followingArtists.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </Rail>
        ) : (
          <EmptyState
            icon={<LibraryIcon className="h-10 w-10" />}
            title="Not following anyone yet"
            subtitle="Follow artists to keep their new drops close."
          />
        )}
      </section>

      {/* Blends + Jams quick links */}
      {(data.blends.length > 0 || data.jams.length > 0) && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Link2 className="h-5 w-5 text-cream" /> Together
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.blends.map((b) => (
              <Link
                key={b.id}
                href={`/blend/${b.id}`}
                className="rounded-3xl border border-ink/40 bg-panel p-4 transition-colors hover:bg-softwhite/5"
              >
                <div className="font-semibold">{b.name}</div>
                <div className="text-sm text-midgrey">Blend · by {b.ownerName}</div>
              </Link>
            ))}
            {data.jams.map((j) => (
              <Link
                key={j.id}
                href={`/jam/${j.id}`}
                className="rounded-3xl border border-ink/40 bg-panel p-4 transition-colors hover:bg-softwhite/5"
              >
                <div className="font-semibold">{j.name}</div>
                <div className="text-sm text-midgrey">Jam · code {j.code}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
