"use client";

import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { formatCount } from "@/lib/utils";
import { prefetchArtist } from "@/lib/song-cache";
import type { ArtistDTO } from "@/lib/types";

/** Circular artist card for rails. */
export function ArtistCard({ artist }: { artist: ArtistDTO }) {
  return (
    <Link
      href={`/artists/${artist.id}`}
      onMouseEnter={() => prefetchArtist(artist.id)}
      onTouchStart={() => prefetchArtist(artist.id)}
      className="group block w-32 shrink-0 text-center sm:w-40"
    >
      <div className="flex justify-center">
        <Avatar
          name={artist.name}
          image={artist.avatarFileId}
          className="h-28 w-28 transition-transform group-hover:scale-105 sm:h-32 sm:w-32"
        />
      </div>
      <div className="mt-2 truncate font-semibold">{artist.name}</div>
      <div className="text-xs text-midgrey">{formatCount(artist.followers)} followers</div>
    </Link>
  );
}
