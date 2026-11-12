"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Old artist route → /artists/[id] (kept so existing links keep working). */
export default function ArtistRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/artists/${id}`);
  }, [id, router]);
  return null;
}
