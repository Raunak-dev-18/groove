import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireContentViewer } from "@/lib/session";
import { storageHealth } from "@/lib/storage";

/** Admin: check whether uploads/downloads work on each storage provider. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireContentViewer(req);
    const report = await storageHealth();
    return ok(report);
  });
}
