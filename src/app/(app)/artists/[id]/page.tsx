"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Globe2, Music4, UserPlus, Users2 } from "lucide-react";
import { api } from "@/lib/client";
import { getArtist, prefetchSong } from "@/lib/song-cache";
import { Avatar } from "@/components/avatar";
import { SongRow } from "@/components/song-row";
import { EmptyState, Spinner } from "@/components/skeletons";
import { formatCount } from "@/lib/utils";
import { useFeedVersion } from "@/hooks/use-feed";
import type { ArtistDTO, SongDTO } from "@/lib/types";

/** /artists/[id] — artist profile with followers, listeners, music and details. */
export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ artist: ArtistDTO; topSongs: SongDTO[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const { refreshKey } = useFeedVersion();

  useEffect(() => {
    let alive = true;
    setError(null);
    setData(null);
    getArtist(id)
      .then((d) => {
        if (!alive) return;
        if (!d) setError("Artist not found");
        else setData(d);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [id, refreshKey]);

  const follow = async () => {
    if (!data || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await api<{ following: boolean; followers: number }>(
        `/api/artists/${data.artist.id}/follow`,
        { method: data.artist.isFollowing ? "DELETE" : "PUT" },
      );
      setData({ ...data, artist: { ...data.artist, isFollowing: res.following, followers: res.followers } });
    } catch {
    } finally {
      setFollowBusy(false);
    }
  };

  if (error) {
    return <EmptyState icon={<Music4 className="h-10 w-10" />} title="Artist not found" subtitle={error} />;
  }
  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const { artist, topSongs } = data;
  const totalPlays = topSongs.reduce((a, s) => a + s.plays, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-center gap-6 rounded-3xl border border-ink/40 bg-panel p-6 text-center sm:flex-row sm:p-8 sm:text-left">
        <Avatar name={artist.name} image={artist.avatarFileId} className="h-32 w-32 sm:h-40 sm:w-40" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-midgrey uppercase">Artist</p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{artist.name}</h1>

          {/* stats row */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
            <span className="flex items-center gap-1.5 text-sm text-mist">
              <Users2 className="h-4 w-4 text-cream" />
              <strong>{formatCount(artist.followers)}</strong>&nbsp;followers
            </span>
            <span className="flex items-center gap-1.5 text-sm text-mist">
              <Music4 className="h-4 w-4 text-cream" />
              <strong>{topSongs.length}</strong>&nbsp;{topSongs.length === 1 ? "song" : "songs"}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-mist">
              <Music4 className="h-4 w-4 text-cream" />
              <strong>{formatCount(totalPlays)}</strong>&nbsp;plays
            </span>
            {artist.country && (
              <span className="flex items-center gap-1.5 text-sm text-mist">
                <Globe2 className="h-4 w-4 text-cream" />
                {artist.country}
              </span>
            )}
          </div>

          {/* genre chips */}
          {artist.genre && (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {artist.genre.split(/[,;]\s*/).filter(Boolean).map((g) => (
                <span key={g} className="rounded-full bg-brand-deep px-3 py-1 text-xs font-bold text-mist">
                  {g.trim()}
                </span>
              ))}
            </div>
          )}

          {artist.bio && <p className="mt-4 max-w-xl text-sm leading-relaxed text-mist">{artist.bio}</p>}

          <button
            type="button"
            onClick={follow}
            disabled={followBusy}
            className={`mt-5 inline-flex items-center gap-2 rounded-full px-6 py-2.5 font-bold transition-all hover:scale-[1.03] disabled:opacity-60 ${
              artist.isFollowing ? "border border-cream/50 text-cream" : "bg-cream text-ink"
            }`}
          >
            {followBusy ? (
              <Spinner />
            ) : artist.isFollowing ? (
              <Check className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {artist.isFollowing ? "Following" : "Follow"}
          </button>
        </div>
      </div>

      {/* Top songs */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Top songs</h2>
        {topSongs.length > 0 ? (
          <div>
            {topSongs.map((s, i) => (
              <div onMouseEnter={() => prefetchSong(s.id)} key={s.id}>
                <SongRow song={s} queue={topSongs} index={i} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No songs yet"
            subtitle="This artist hasn't released music on Groove yet."
          />
        )}
      </section>
    </div>
  );
}
