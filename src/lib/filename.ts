/**
 * Filename → song metadata parser for uploads.
 *
 * Handles the common conventions found in downloaded music:
 *   "Bol Na Halke Halke - Rahat Fateh Ali Khan.mp3"   → title + artist
 *   "Artist - Title.mp3"                              → flipped when the artist is known
 *   "Song (feat. X) - Artist.mp3"                     → featured extraction
 *   "Movie - Song - Artist.mp3"                       → multi-segment
 *   "01 - Song.mp3"                                   → track numbers stripped
 *   "[Official Video] / (320kbps) / Yeh Jawaani (2009)" → noise removed, movie names kept
 */

const AUDIO_EXT = /\.(mp3|wav|m4a|flac|ogg|aac|opus|wma)$/i;
const NOISE =
  /official\s*(music\s*)?(video|audio)|lyrical|\bfull\s*song\b|\baudio\s+song\b|remaster(ed)?|320\s*kbps|128\s*kbps|\bkbps\b|\bhq\b|\bhd\b|exclusive|lofi|\bvideo\b/i;

export interface ParsedSongMeta {
  title: string;
  primaryArtist: string;
  featured: string[];
  /** bracketed extras worth keeping (movie names etc.) — fed into the description */
  notes: string[];
}

function splitArtists(s: string): string[] {
  return s
    .split(/\s*(?:,|&|and|\/|\+)\s*|\s+x\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * @param filename    the file name (with or without extension)
 * @param knownArtists existing artist names — used to tell "Title - Artist"
 *                    apart from "Artist - Title"
 * @param folderHint  first folder of a bulk folder upload — used as the artist
 *                    when the filename itself carries none
 */
export function parseSongFilename(
  filename: string,
  knownArtists: string[] = [],
  folderHint?: string,
): ParsedSongMeta {
  const notes: string[] = [];
  const featured: string[] = [];

  let name = filename.replace(AUDIO_EXT, "").replace(/_+/g, " ");

  // featured artists inside brackets: "(feat. X)" / "[ft. Y]"
  const featRe = /[([]\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)[)\]]/gi;
  for (const m of name.matchAll(featRe)) featured.push(...splitArtists(m[1]));
  name = name.replace(featRe, " ");

  // strip remaining brackets — keep their content unless it's pure noise
  name = name.replace(/[([]\s*([^)\]]*?)\s*[)\]]/g, (_all, c: string) => {
    const content = c.trim();
    if (content && !NOISE.test(content)) notes.push(content);
    return " ";
  });

  // bare noise tokens
  name = name.replace(/\b(320\s*kbps|128\s*kbps|kbps|hq|hd)\b/gi, " ");
  name = name.replace(/\s+/g, " ").trim();

  // split on dash-like separators: " - ", " – ", " — ", " -- ", " | ", " ~ "
  const parts = name
    .split(/\s+(?:--|[-–—|~])\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  // drop leading track numbers ("01", "12.")
  while (parts.length > 1 && /^\d{1,3}[.)]?$/.test(parts[0])) parts.shift();

  const known = (s: string) => !!s && knownArtists.some((a) => a.toLowerCase().trim() === s.toLowerCase().trim());

  let title = name;
  let primaryArtist = "";

  if (parts.length >= 2) {
    // the artist is the rightmost segment matching a known artist; if none,
    // default to the LAST segment ("Title - Artist" — the user's convention)
    let ai = -1;
    for (let i = parts.length - 1; i >= 1; i--) {
      if (known(parts[i])) {
        ai = i;
        break;
      }
    }
    if (ai === -1 && known(parts[0])) ai = 0;
    if (ai === -1) ai = parts.length - 1;

    primaryArtist = parts[ai];
    title = parts.filter((_, i) => i !== ai).join(" - ");
  } else if (parts.length === 1) {
    title = parts[0].replace(/^\d{1,3}[.)]?\s+/, "").trim();
  }

  // "feat." tails inside the title
  const featInTitle = /\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i.exec(title);
  if (featInTitle) {
    featured.push(...splitArtists(featInTitle[1]));
    title = title.slice(0, featInTitle.index).trim();
  }

  // the artist segment may itself list several artists: "X & Y"
  if (primaryArtist) {
    const list = splitArtists(primaryArtist);
    primaryArtist = list[0] ?? "";
    featured.push(...list.slice(1));
  }

  // folder hint when the filename carries no artist at all
  if (!primaryArtist && folderHint) {
    primaryArtist = folderHint.trim();
  }

  title = title
    .replace(/\s*(?:--|[-–—|~])\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) title = name.trim();

  const uniqFeatured = [...new Set(featured.map((f) => f.trim()).filter(Boolean))];

  return {
    title,
    primaryArtist,
    featured: uniqFeatured,
    notes: notes.filter((n) => !NOISE.test(n)),
  };
}

/** Auto-description: "Song by X feat. Y — from Movie (2024)". */
export function autoDescription(meta: ParsedSongMeta): string {
  const names = [meta.primaryArtist, ...meta.featured].filter(Boolean);
  if (names.length === 0) return "";
  let d = `Song by ${names.join(", ")}`;
  if (meta.notes.length > 0) d += ` — ${meta.notes.join(", ")}`;
  return d;
}
