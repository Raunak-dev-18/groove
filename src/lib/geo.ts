import type { NextRequest } from "next/server";

const ISO2 = /^[A-Za-z]{2}$/;

/**
 * Best-effort country detection, in order of reliability:
 *  1. `x-groove-country` — set by the mobile app from device locale
 *  2. `cf-ipcountry` — Cloudflare edge (our tunnel / CDN deployments)
 *  3. `x-vercel-ip-country` — Vercel deployments
 *  4. `accept-language` region subtag (e.g. "en-IN" → IN)
 */
export function countryFromRequest(req: NextRequest): string | null {
  const explicit = req.headers.get("x-groove-country");
  if (explicit && ISO2.test(explicit)) return explicit.toUpperCase();
  const cf = req.headers.get("cf-ipcountry");
  if (cf && ISO2.test(cf)) return cf.toUpperCase();
  const vercel = req.headers.get("x-vercel-ip-country");
  if (vercel && ISO2.test(vercel)) return vercel.toUpperCase();
  const al = req.headers.get("accept-language") ?? "";
  const m = /(?:^|[,;])\s*[a-z]{2}(?:-[A-Za-z]{2})?/.exec(al.toLowerCase());
  if (m) {
    const full = al.slice(m.index ?? 0, (m.index ?? 0) + m[0].length);
    const sub = /-([A-Za-z]{2})\b/.exec(full);
    if (sub) return sub[1].toUpperCase();
  }
  return null;
}
