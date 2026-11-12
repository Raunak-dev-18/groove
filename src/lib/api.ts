import { NextResponse } from "next/server";
import { ApiError } from "@/lib/session";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a route handler with uniform error handling. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fail(err.message, err.status);
    console.error("[api]", err);
    return fail(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

export function clampInt(v: string | null, min: number, max: number, dflt: number) {
  const n = parseInt(v ?? "", 10);
  if (Number.isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
