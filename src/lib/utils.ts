import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** 215 -> "3:35" */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 12345 -> "12.3K" */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Media reference → displayable URL. Storage file ids go through the proxy;
 *  direct http(s) URLs (pasted by admins) pass through untouched. */
export function mediaUrl(fileId: string | null | undefined): string | null {
  if (!fileId) return null;
  if (/^https?:\/\//i.test(fileId)) return fileId;
  return `/api/cdn/files/${fileId}`;
}

/** A media ref is valid if it's a storage id OR a well-formed http(s) URL. */
export function isValidMediaRef(v: string): boolean {
  if (/^https?:\/\//i.test(v)) {
    try {
      new URL(v);
      return v.length <= 2048;
    } catch {
      return false;
    }
  }
  return v.length <= 256;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 6-char invite code for jams/blends. */
export function genCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
