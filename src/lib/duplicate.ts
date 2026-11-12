/**
 * Duplicate detection for song uploads.
 *
 * A song is a duplicate when its normalized TITLE + primary ARTIST match an
 * existing song. Normalization strips the noise that makes the same track
 * look different in different filenames:
 *   "Zaalima (From 'Jolly LLB 2')"  ==  "Zaalima"
 *   "Hasi - Lofi Remix" bracketed variants, feat. tags, punctuation, case.
 *
 * Shared by the server (authoritative 409 guard + batch check endpoint)
 * and the client (intra-queue duplicate flagging in bulk upload).
 */

/** Normalize a title or artist name to a comparison key fragment. */
export function normSongText(s: string): string {
  return s
    .toLowerCase()
    // (feat. X) / (ft. X) / (featuring X)
    .replace(/\((?:feat\.?|ft\.?|featuring)\b[^)]*\)/gi, " ")
    // any other bracketed content — (remix), [live], (From "Movie"), (Male Version)
    .replace(/[([][^)\]]*[)\]]/g, " ")
    // trailing "feat. X" without brackets
    .replace(/\b(?:feat\.?|ft\.?)\s+.*$/i, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Composite key: same title + same primary artist → duplicate. */
export function songDuplicateKey(title: string, artist: string): string {
  return `${normSongText(title)}::${normSongText(artist)}`;
}
