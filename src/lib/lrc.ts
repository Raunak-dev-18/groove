/**
 * LRC / plain-text lyrics utilities.
 *
 * LRC is the industry-standard synced-lyrics format — one timestamped line
 * per lyric:
 *
 *   [00:12.30]First line
 *   [01:02.10][01:22.00]Repeated line (multiple stamps are legal)
 *   [ti:Title] [ar:Artist] [offset:+500]  ← metadata tags (ignored or applied)
 *
 * Plain (unsynced) lyrics are also supported — every line simply has no time.
 */

export interface LyricLine {
  /** seconds into the song, or null for unsynced lines */
  time: number | null;
  text: string;
}

const TAG_RE = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

/** Does this text carry LRC timestamps? (used to auto-detect synced lyrics) */
export function looksSynced(raw: string): boolean {
  return TAG_RE.test(raw);
}

export function parseLyrics(raw: string, synced: boolean): LyricLine[] {
  if (!raw?.trim()) return [];
  if (!synced && !looksSynced(raw)) {
    // plain text — keep it as-is (collapse >2 consecutive blank lines)
    return raw
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((text) => ({ time: null, text: text.trimEnd() }));
  }

  // LRC mode (synced=true, or timestamps detected anyway)
  const lines: { time: number; text: string }[] = [];
  let offsetMs = 0;
  for (const line of raw.split(/\r?\n/)) {
    const offsetTag = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(line);
    if (offsetTag) {
      offsetMs = parseInt(offsetTag[1], 10);
      continue;
    }
    if (/^\s*\[(ti|ar|al|au|by|re|ve|length):/i.test(line)) continue; // metadata

    TAG_RE.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    while ((match = TAG_RE.exec(line))) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2].replace(":", "."));
      stamps.push(min * 60 + sec);
      lastEnd = TAG_RE.lastIndex;
    }
    const text = line.slice(lastEnd).trim();
    if (stamps.length === 0) {
      if (text) lines.push({ time: -1, text }); // unsynced stray line — pin to top
      continue;
    }
    for (const t of stamps) lines.push({ time: t, text });
  }

  const adjusted = lines
    .map((l) => ({ time: l.time < 0 ? null : Math.max(0, l.time + offsetMs / 1000), text: l.text }))
    .filter((l) => l.text !== "" || l.time !== null);
  adjusted.sort((a, b) => (a.time ?? -1) - (b.time ?? -1));
  return adjusted;
}

/** Index of the line that should be highlighted at `positionSec`,
 *  or -1. Binary search — called every position tick. */
export function activeLineIndex(lines: LyricLine[], positionSec: number): number {
  if (lines.length === 0) return -1;
  if (lines[0].time === null) return -1; // unsynced
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid].time ?? Infinity) <= positionSec + 0.05) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
