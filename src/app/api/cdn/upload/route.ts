import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { requireContentEditor } from "@/lib/session";
import { MAX_FILE_BYTES, uploadFile } from "@/lib/storage";

/**
 * Admin upload — forwards the file to the storage provider (Dropin CDN API
 * or local fallback). Returns { id, name, size, mime, provider }.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireContentEditor(req);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return fail("File required", 400);
    if (file.size === 0) return fail("File is empty", 400);
    if (file.size > MAX_FILE_BYTES) return fail("File is too large (max 150 MB)", 400);

    const result = await uploadFile(file);
    return ok(result);
  });
}
