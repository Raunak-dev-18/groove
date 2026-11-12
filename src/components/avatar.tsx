import { cn, initials, mediaUrl } from "@/lib/utils";

/** Circular avatar (artist portraits / user profile) with initials fallback. */
export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  const url = mediaUrl(image);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-softwhite/20 bg-brand-deep text-softwhite",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold">{initials(name)}</span>
      )}
    </div>
  );
}
