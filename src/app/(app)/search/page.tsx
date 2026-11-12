"use client";

import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { api } from "@/lib/client";
import { useFeedVersion } from "@/hooks/use-feed";
import { SongRow } from "@/components/song-row";
import { ArtistCard } from "@/components/artist-card";
import { Rail } from "@/components/section";
import { SkeletonRowList, EmptyState } from "@/components/skeletons";
import type { ArtistDTO, SongDTO } from "@/lib/types";

type Results = { songs: SongDTO[]; artists: ArtistDTO[] };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (!query) {
      setResults(null);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      api<Results>(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => {
          setResults(r);
          setSearched(true);
        })
        .catch(() => setResults({ songs: [], artists: [] }))
        .finally(() => setLoading(false));
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Search</h1>

      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-midgrey" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Songs, artists, genres…"
          autoFocus
          className="w-full rounded-full border border-softwhite/15 bg-panel py-4 pr-6 pl-13 text-lg text-softwhite placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
        />
      </div>

      {loading && <SkeletonRowList count={5} />}

      {!loading && results && (
        <div className="space-y-8">
          {results.artists.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Artists</h2>
              <Rail>
                {results.artists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </Rail>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Songs</h2>
            {results.songs.length > 0 ? (
              <div>
                {results.songs.map((s, i) => (
                  <SongRow key={s.id} song={s} queue={results.songs} index={i} />
                ))}
              </div>
            ) : (
              searched && (
                <EmptyState
                  icon={<SearchIcon className="h-10 w-10" />}
                  title="No matches"
                  subtitle={`Nothing found for “${q.trim()}”. Try another search.`}
                />
              )
            )}
          </section>
        </div>
      )}

      {!results && !loading && (
        <EmptyState
          icon={<SearchIcon className="h-10 w-10" />}
          title="Find your sound"
          subtitle="Search for songs, artists or genres to start listening."
        />
      )}
    </div>
  );
}
