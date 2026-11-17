/**
 * LRCLIB integration — the free/open lyrics database (lrclib.net).
 * No API key; it asks for a descriptive User-Agent, which we send.
 *
 * Used by /api/songs/[id]/lyrics when a song has no stored lyrics: we try
 * a few title/artist spellings and persist whatever comes back so each song
 * is only ever fetched once (or until an admin force-refreshes).
 */

const LRCLIB = "https://lrclib.net/api";
const UA = "Groove/1.2.0 (https://groove.raunak.wtf)";

export interface FetchedLyrics {
  lyrics: string;
  synced: boolean;
}

/** Clean a song title for better matching: drop bracketed suffixes and
 *  "feat." clauses. "Zaalima (From 'Raees')" → "Zaalima". */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[(\[].*?[)\]]\s*/g, " ")
    .replace(/\s*(feat|ft|with)\.?\s+.*$/i, "")
    .replace(/\s*[-–]\s*(remix|live|unplugged|acoustic).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function lrclibGet(params: Record<string, string | number>): Promise<FetchedLyrics | null> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  const res = await fetch(`${LRCLIB}/get?${qs}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return null; // 404 = no match in their database
  const data = (await res.json()) as {
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
  };
  const synced = (data.syncedLyrics ?? "").trim();
  if (synced) return { lyrics: synced, synced: true };
  const plain = (data.plainLyrics ?? "").trim();
  if (plain) return { lyrics: plain, synced: false };
  return null;
}

/** Try to find lyrics for a song. Best-effort — returns null on any miss. */
export async function fetchLyricsFromLrclib(
  title: string,
  artist: string,
  durationSec: number,
): Promise<FetchedLyrics | null> {
  const cleaned = cleanTitle(title);
  const firstArtist = artist.split(",")[0].trim();
  const attempts: Array<Record<string, string | number>> = [];
  if (durationSec > 0) {
    attempts.push({ track_name: cleaned, artist_name: artist, duration: Math.round(durationSec) });
  }
  attempts.push({ track_name: cleaned, artist_name: artist });
  if (firstArtist && firstArtist !== artist) {
    attempts.push({ track_name: cleaned, artist_name: firstArtist });
  }
  attempts.push({ track_name: title, artist_name: artist });
  attempts.push({ track_name: cleaned });

  for (const params of attempts) {
    try {
      const hit = await lrclibGet(params);
      if (hit) return hit;
    } catch {
      /* try the next variant */
    }
  }
  return null;
}
