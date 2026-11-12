/* Groove service worker — caches songs & artwork on the device.
 *
 * /api/cdn/files/:id responses are content-addressed (a new upload gets a new
 * UUID), so they are immutable: cache-first is always safe.
 *
 * Latency rules:
 *  - cache HIT: ranges are served instantly by slicing the cached full body
 *  - cache MISS + no Range: stream + store the full response
 *  - cache MISS + Range (audio first play): the ranged request goes straight
 *    to the network for instant first-byte, while the FULL file is fetched in
 *    the background to fill the cache — no waiting for whole-file downloads
 *    before playback can start.
 */

const CACHE = "groove-media-v1";
const MAX_ENTRIES = 60; // ~60 songs (few MB each) — FIFO trim
const MEDIA_PATH = "/api/cdn/files/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(MEDIA_PATH)) return;
  event.respondWith(handleMedia(req, url, event));
});

async function handleMedia(req, url, event) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname; // ignore query string
  const range = req.headers.get("range");

  const cached = await cache.match(key);
  if (cached) {
    return range ? sliceRange(cached, range) : cached;
  }

  try {
    if (!range) {
      // full GET: stream to the page and store a copy
      const full = await fetch(key, { headers: {} });
      if (full.status === 200) {
        const forCache = full.clone();
        await cache.put(key, forCache);
        trim(cache);
      }
      return full;
    }

    // ranged request, nothing cached: LOW LATENCY path — proxy the range
    // straight to the network so playback starts immediately…
    const network = await fetch(req);
    // …and fill the cache with the whole file in the background so the next
    // play (and seeking) is served from the device.
    if (network.status === 206 || network.ok) {
      const fill = fetch(key, { headers: {} })
        .then(async (full) => {
          if (full.status === 200) {
            await cache.put(key, full);
            trim(cache);
          }
        })
        .catch(() => {});
      event.waitUntil(fill);
    }
    return network;
  } catch {
    return new Response("Offline", { status: 504 });
  }
}

/** Build a 206 Partial Content response by slicing the cached full body. */
async function sliceRange(full, rangeHeader) {
  const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader || "");
  if (!m) return full;
  const buf = await full.arrayBuffer();
  const total = buf.byteLength;
  const start = parseInt(m[1], 10);
  const end = m[2] === "" ? total - 1 : Math.min(parseInt(m[2], 10), total - 1);
  if (start >= total) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  const slice = buf.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      "Content-Type": full.headers.get("content-type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(slice.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

/** FIFO trim so the cache doesn't grow without bound. */
async function trim(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) {
        await cache.delete(k);
      }
    }
  } catch {
    /* trim is best-effort */
  }
}
