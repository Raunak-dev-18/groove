"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/client";
import { useFeedVersion } from "@/hooks/use-feed";
import { prefetchArtist, prefetchList } from "@/lib/song-cache";
import { Avatar } from "@/components/avatar";
import { EmptyState, Spinner } from "@/components/skeletons";
import { formatCount } from "@/lib/utils";
import type { ArtistDTO } from "@/lib/types";

const CHUNK = 24;
interface ArtistsPage {
  items: ArtistDTO[];
  total: number;
  nextOffset: number | null;
}

/** /artists — browse all artists. The next chunk is prefetched while you
 *  scroll, so "Load more" (and hover-into-profiles) feels instant. */
export default function ArtistsPage() {
  const [chunks, setChunks] = useState<ArtistDTO[][]>([]);
  const { refreshKey } = useFeedVersion();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  const loadChunk = useCallback(async (offset: number) => {
    const res = await api<ArtistsPage>(`/api/artists?limit=${CHUNK}&offset=${offset}`);
    return res;
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadChunk(0)
      .then((res) => {
        if (!alive) return;
        setChunks([res.items]);
        setTotal(res.total);
        setNextOffset(res.nextOffset);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loadChunk, refreshKey]);

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return;
    setLoading(true);
    // served from prefetch cache if it was already warmed
    const res = await prefetchList<ArtistsPage>(
      `artists-${nextOffset}`,
      `/api/artists?limit=${CHUNK}&offset=${nextOffset}`,
    );
    if (res?.items?.length) {
      setChunks((c) => [...c, res.items]);
      setTotal(res.total);
      setNextOffset(res.nextOffset);
    }
    setLoading(false);
  }, [nextOffset]);

  // prefetch the next chunk while the user browses this one
  useEffect(() => {
    if (nextOffset != null && !loading) {
      const t = setTimeout(() => {
        prefetchList(`artists-${nextOffset}`, `/api/artists?limit=${CHUNK}&offset=${nextOffset}`);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [nextOffset, loading]);

  const artists = chunks.flat();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Artists</h1>
        <p className="mt-1 text-sm text-mist">
          {total > 0 ? `${total} artists on Groove — hover one to pre-load its profile.` : "Everyone making music on Groove."}
        </p>
      </div>

      {chunks.length === 0 && loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="groove-skeleton aspect-square w-full rounded-full" />
              <div className="groove-skeleton mx-auto h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : artists.length === 0 ? (
        <EmptyState
          title="No artists yet"
          subtitle="Admins can create artists from the Admin panel."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {artists.map((a) => (
              <Link
                key={a.id}
                href={`/artists/${a.id}`}
                onMouseEnter={() => prefetchArtist(a.id)}
                onTouchStart={() => prefetchArtist(a.id)}
                className="group rounded-3xl border border-ink/40 bg-panel p-4 text-center transition-colors hover:bg-softwhite/5"
              >
                <div className="flex justify-center">
                  <Avatar
                    name={a.name}
                    image={a.avatarFileId}
                    className="h-24 w-24 transition-transform group-hover:scale-105 sm:h-28 sm:w-28"
                  />
                </div>
                <div className="mt-3 truncate font-semibold">{a.name}</div>
                <div className="text-xs text-midgrey">
                  {a.genre || "Artist"} · {formatCount(a.followers)} followers
                </div>
              </Link>
            ))}
          </div>

          {nextOffset != null && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="flex items-center gap-2 rounded-full border border-softwhite/20 px-6 py-3 font-semibold text-mist transition-colors hover:bg-softwhite/10 disabled:opacity-60"
              >
                {loading ? <Spinner /> : <ChevronDown className="h-4 w-4" />}
                {loading ? "Loading…" : "Load more artists"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
