/* Groove service worker v2 — caches songs & artwork on the device.
 *
 * /api/cdn/files/:id responses are content-addressed (a new upload gets a new
 * UUID), so they are immutable: cache-first is always safe.
 *
 * Latency rules:
 *  - cache HIT: ranges are served instantly by slicing the cached full body
 *  - cache MISS + no Range: stream to the page and store the full response
 *  - cache MISS + Range (audio first play): the ranged request goes straight
 *    to the network for instant first-byte, while the FULL file is fetched in
 *    the background to fill the cache — no waiting for whole-file downloads
 *    before playback can start.
 *
 * v2 vs v1:
 *  - size-aware eviction: 1.5 GB byte cap (lossless FLAC ≈ 40 MB/song) with a
 *    per-file size map maintained in the __meta__ entry; v1 was entry-count
 *    FIFO (60 files could mean 2.4 GB of FLAC)
 *  - puts refresh recency (delete-then-put) so cache.keys() order == LRU order
 *  - QuotaExceededError handling: trim to 80% and retry once
 */

const CACHE = "groove-media-v2";
const OLD_CACHES = ["groove-media-v1"];
const META_KEY = "__groove-meta__";
const META_URL = self.location.origin + "/__groove-meta__";
const MAX_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GB
const MEDIA_PATH = "/api/cdn/files/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of OLD_CACHES) await caches.delete(name).catch(() => {});
      await self.clients.claim();
    })(),
  );
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
        const size = parseInt(full.headers.get("content-length") || "0", 10);
        const forCache = full.clone();
        await putWithEviction(cache, key, forCache, size);
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
            const size = parseInt(full.headers.get("content-length") || "0", 10);
            await putWithEviction(cache, key, full, size);
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

/** Store a file, refreshing its recency (delete-then-put keeps keys() in
 *  LRU order), then evict if over the byte cap. Survives quota errors. */
async function putWithEviction(cache, key, response, size) {
  const retry = response.clone(); // pristine copy for a possible quota retry
  const put = async (res) => {
    await cache.delete(key).catch(() => {});
    await cache.put(key, res);
    if (size > 0) {
      const meta = await readMeta(cache);
      meta.sizes[key] = size;
      await writeMeta(cache, meta);
    }
  };
  try {
    await put(response);
  } catch (err) {
    if (err && /quota/i.test(err.name || "")) {
      await evict(cache, 0.8 * MAX_BYTES);
      try {
        await put(retry);
      } catch {
        /* give up on this file — playback still works from the network */
      }
    } else {
      throw err;
    }
  }
  await evict(cache, MAX_BYTES);
}

/** Drop oldest cached files until the cache is under `cap` bytes.
 *  __meta__ holds { key → size } and is updated alongside. */
async function evict(cache, cap) {
  try {
    const meta = await readMeta(cache);
    const keys = await cache.keys();
    let total = 0;
    for (const size of Object.values(meta.sizes)) total += size || 0;

    // measure untracked files once (older v1-style or externally added)
    const track = [];
    for (const req of keys) {
      const k = metaIndexOf(req);
      if (!k || k === META_KEY) continue;
      if (!meta.sizes[k]) {
        track.push(
          (async () => {
            const hit = await cache.match(req);
            if (!hit) return;
            const buf = await hit.arrayBuffer().catch(() => null);
            if (buf) {
              meta.sizes[k] = buf.byteLength;
              total += buf.byteLength;
            }
          })(),
        );
      }
    }
    if (track.length) await Promise.all(track);

    if (total <= cap) {
      await writeMeta(cache, meta);
      return;
    }

    for (const req of keys) {
      if (total <= cap) break;
      const k = metaIndexOf(req);
      if (!k || k === META_KEY) continue;
      const size = meta.sizes[k] || 0;
      if (await cache.delete(req)) {
        total -= size;
        delete meta.sizes[k];
      }
    }
    await writeMeta(cache, meta);
  } catch {
    /* eviction is best-effort */
  }
}

function metaIndexOf(req) {
  try {
    const u = new URL(req.url);
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

async function readMeta(cache) {
  try {
    const hit = await cache.match(META_URL);
    if (hit) {
      const parsed = JSON.parse(await hit.text());
      if (parsed && parsed.sizes) return parsed;
    }
  } catch {
    /* fall through */
  }
  return { sizes: {} };
}

async function writeMeta(cache, meta) {
  try {
    await cache.put(new Request(META_URL), new Response(JSON.stringify(meta)));
  } catch {
    /* non-fatal */
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
