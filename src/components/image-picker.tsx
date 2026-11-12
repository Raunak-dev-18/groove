"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers";
import { uploadFile } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * Admin image picker: upload a file OR paste a direct image URL.
 * The stored value is either a storage file id or the URL itself —
 * mediaUrl() handles both everywhere else in the app.
 */
export function ImagePicker({
  label,
  value,
  onChange,
  round = false,
  size = 88,
  allowClear = true,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  round?: boolean;
  size?: number;
  allowClear?: boolean;
}) {
  const { toast } = useToast();
  const [pct, setPct] = useState<number | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  useEffect(() => {
    setUrlDraft(value && /^https?:/i.test(value) ? value : "");
  }, [value]);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("Please pick an image file", "error");
      return;
    }
    setPct(0);
    try {
      const res = await uploadFile(file, setPct);
      if (res.fallback) toast(res.warning ?? "Stored in local fallback storage", "info");
      onChange(res.id);
      toast("Image uploaded", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPct(null);
    }
  };

  const applyUrl = (url: string) => {
    const t = url.trim();
    if (!t) {
      if (value && /^https?:/i.test(value)) onChange(null);
      return;
    }
    if (!/^https?:\/\//i.test(t)) {
      toast("URL must start with http:// or https://", "error");
      return;
    }
    try {
      new URL(t);
    } catch {
      toast("That doesn't look like a valid URL", "error");
      return;
    }
    onChange(t);
    toast("Image URL linked — it will show exactly where the upload would", "success");
  };

  const isUrl = !!value && /^https?:/i.test(value);

  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold text-mist">{label}</span>
      <div className="flex items-start gap-4">
        {/* preview */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "flex items-center justify-center overflow-hidden border border-cream/40 bg-cream",
              round ? "rounded-full" : "rounded-2xl",
            )}
            style={{ width: size, height: size }}
          >
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={isUrl ? value : `/api/cdn/files/${value}`}
                alt="preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold text-ink/60">None</span>
            )}
          </div>
          {allowClear && value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remove image"
              className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-panel text-softwhite ring-1 ring-softwhite/25 hover:text-red-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="w-full text-sm text-midgrey file:mr-3 file:rounded-full file:border-0 file:bg-cream file:px-4 file:py-2 file:font-bold file:text-ink"
          />
          {pct !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-softwhite/10">
              <div className="h-full bg-cream transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => applyUrl(urlDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyUrl(urlDraft);
                }
              }}
              placeholder="…or paste an image URL"
              className="min-w-0 flex-1 rounded-xl border border-softwhite/15 bg-brand-deep/50 px-3 py-2 text-sm placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => applyUrl(urlDraft)}
              className="shrink-0 rounded-full border border-softwhite/20 px-3 py-2 text-sm font-semibold text-mist transition-colors hover:bg-softwhite/10"
            >
              Use URL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
