import { Music2 } from "lucide-react";
import { cn, mediaUrl } from "@/lib/utils";

/** Square rounded artwork with warm-cream placeholder (design system §7). */
export function Artwork({
  fileId,
  alt,
  className,
  rounded = "rounded-2xl",
}: {
  fileId?: string | null;
  alt: string;
  className?: string;
  rounded?: string;
}) {
  const url = mediaUrl(fileId);
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-cream/40 bg-cream",
        rounded,
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Music2 className="h-1/3 w-1/3 text-ink/70" strokeWidth={2} />
        </div>
      )}
    </div>
  );
}
