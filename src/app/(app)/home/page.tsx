"use client";

import { useEffect, useState } from "react";
import { AudioLines, Music4 } from "lucide-react";
import { useFeedVersion } from "@/hooks/use-feed";
import type { ArtistDTO, SongDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { useSession } from "@/lib/auth-client";
import { Rail, Section } from "@/components/section";
import { SongCard } from "@/components/song-card";
import { SongRow } from "@/components/song-row";
import { ArtistCard } from "@/components/artist-card";
import { SkeletonCards, SkeletonRowList, EmptyState } from "@/components/skeletons";

interface HomeData {
  trending: SongDTO[];
  newReleases: SongDTO[];
  followingArtists: ArtistDTO[];
  recentPlays: SongDTO[];
  forYou: SongDTO[];
  taste: {
    genres: { name: string; score: number }[];
    artists: { id: string; name: string }[];
    signals: { likes: number; plays: number; follows: number };
  };
  discoverArtists: ArtistDTO[];
}

/** Home — everything in ONE request (trending, for you, taste, onboarding). */
export default function HomePage() {
  const { data: session } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { refreshKey } = useFeedVersion();

  useEffect(() => {
    api<HomeData>("/api/home")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [refreshKey]);

  const name = session?.user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (error) {
    return <EmptyState icon={<Music4 className="h-10 w-10" />} title="Could not load your feed" subtitle={error} />;
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold text-mist">{greeting}</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Hey <span className="text-cream">{name}</span> — what&apos;s the vibe today?
        </h1>
        {data && data.taste.genres.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-midgrey uppercase">Your taste</span>
            {data.taste.genres.slice(0, 4).map((g) => (
              <span key={g.name} className="rounded-full bg-brand-deep px-3 py-1 text-xs font-bold text-mist">
                {g.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {!data ? (
        <div className="space-y-8">
          <Section title="Trending now">
            <SkeletonCards />
          </Section>
          <Section title="Made for you">
            <SkeletonCards />
          </Section>
        </div>
      ) : (
        <>
          {data.forYou.length > 0 && (
            <Section title="Made for you">
              <Rail>
                {data.forYou.map((s) => (
                  <SongCard key={s.id} song={s} queue={data.forYou} />
                ))}
              </Rail>
            </Section>
          )}

          {data.discoverArtists.length > 0 && (
            <Section title="Artists for you" href="/artists">
              <Rail>
                {data.discoverArtists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </Rail>
            </Section>
          )}

          {data.trending.length > 0 && (
            <Section title="Trending now">
              <Rail>
                {data.trending.map((s) => (
                  <SongCard key={s.id} song={s} queue={data.trending} />
                ))}
              </Rail>
            </Section>
          )}

          {data.recentPlays.length > 0 && (
            <Section title="Jump back in">
              <Rail>
                {data.recentPlays.map((s) => (
                  <SongCard key={s.id} song={s} queue={data.recentPlays} />
                ))}
              </Rail>
            </Section>
          )}

          {data.newReleases.length > 0 && (
            <Section title="New releases">
              <Rail>
                {data.newReleases.map((s) => (
                  <SongCard key={s.id} song={s} queue={data.newReleases} />
                ))}
              </Rail>
            </Section>
          )}

          <Section title={data.followingArtists.length ? "Artists you follow" : "Find artists"}>
            {data.followingArtists.length > 0 ? (
              <Rail>
                {data.followingArtists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </Rail>
            ) : (
              <EmptyState
                icon={<AudioLines className="h-10 w-10" />}
                title="You're not following anyone yet"
                subtitle="Find artists you love and hit Follow to see their music here."
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
