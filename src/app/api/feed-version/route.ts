import { handle, ok } from "@/lib/api";
import { getFeedVersion } from "@/lib/feed-events";

/**
 * Lightweight content version — polled by clients to detect when admin
 * adds/edits songs or artists. No auth required (it's just a number).
 * Served from the two-tier cache: L1 absorbs the 5s polling storm,
 * Redis keeps the value consistent across instances.
 */
export async function GET() {
  return handle(async () => {
    const v = await getFeedVersion();
    return ok({ v });
  });
}
