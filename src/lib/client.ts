/** Tiny fetch wrapper for client components — same-origin, JSON, error toasts.
 * GETs retry with backoff on 429 so a momentary rate-limit never breaks UI. */
export async function api<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  // Retry idempotent reads when rate limited — honors Retry-After when present
  const method = (init?.method ?? "GET").toUpperCase();
  const retryable = res.status === 429 && attempt < 2 && !init?.body && method === "GET";
  if (retryable) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 10_000)
      : 500 * 2 ** attempt; // 0.5s, 1s
    await new Promise((r) => setTimeout(r, waitMs));
    return api<T>(path, init, attempt + 1);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data as { error?: string })?.error ??
        (res.status === 401 ? "Please sign in" : res.status === 429 ? "Too many requests — slowing down" : `Request failed (${res.status})`),
    );
  }
  return data as T;
}

/** Upload a file to /api/cdn/upload with progress events (XHR under the hood). */
export function uploadFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ id: string; name: string; size: number; mime: string; provider: string; fallback?: boolean; warning?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/cdn/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}
