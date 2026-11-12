import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { readStoredFile } from "@/lib/storage";

/**
 * Public streaming proxy for stored files.
 * Passes Range headers through so browsers / audio players can seek
 * (chunked byte-range streaming), without exposing storage credentials.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const range = req.headers.get("range");
    return readStoredFile(id, range);
  });
}
