import { cached, invalidate } from "@/lib/server-cache";
import { db } from "@/db";
import { artists } from "@/db/schema";

/**
 * Find an artist by smart name matching (exact → normalized → fuzzy),
 * or create it. Prevents "AR Rahman" / "A. R. Rahman" duplicates.
 */
export async function resolveArtistByName(rawName: string): Promise<string> {
  const name = rawName.replace(/\s+/g, " ").trim();
  const existing = await findArtistBySmartName(name);
  if (existing) return existing.id;
  const [created] = await db.insert(artists).values({ name }).returning();
  await invalidate("artists:");
  await invalidate("artists:allnames");
  await invalidate("songs:");
  await invalidate("public-songs:");
  return created.id;
}

/**
 * Smart artist resolution — prevents duplicates like "AR Rahman" vs
 * "A. R. Rahman" (or "Arjit Singh" vs "Arijit Singh") from creating
 * separate artists:
 *
 *   1. exact case-insensitive match
 *   2. normalized match — all punctuation/spaces stripped, so
 *      "A. R. Rahman" / "AR Rahman" / "ar-rahman" all normalize to "arrahman"
 *   3. fuzzy — Levenshtein ≤ 1 on the normalized keys (≤ 2 for long names),
 *      so typos like "Arjit Singh" → "Arijit Singh" resolve too.
 *      Short names (≤ 4 chars) require an exact normalized match to avoid
 *      merging distinct short names ("King" vs "Kings").
 */

/** Aggressive key: lowercase, only alphanumerics kept. */
export function normArtistKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Do two artist names refer to the same artist? */
export function isSameArtist(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const ka = normArtistKey(a);
  const kb = normArtistKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const minLen = Math.min(ka.length, kb.length);
  if (minLen <= 4) return false; // short names: normalized-exact only
  const dist = levenshtein(ka, kb);
  return dist <= (minLen >= 12 ? 2 : 1);
}

/** All artist names, briefly cached (the artist table is small). */
async function allArtistNames(): Promise<{ id: string; name: string }[]> {
  return cached("artists:allnames", 5_000, async () =>
    db.select({ id: artists.id, name: artists.name }).from(artists).limit(5000),
  );
}

/** Find an existing artist matching the name under the smart rules. */
export async function findArtistBySmartName(
  name: string,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  const all = await allArtistNames();
  for (const a of all) {
    if (excludeId && a.id === excludeId) continue;
    if (isSameArtist(name, a.name)) return a;
  }
  return null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
