import { cn } from "@/lib/utils";

/** Shimmer skeleton blocks (loading states). */
export function SkeletonRowList({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="groove-skeleton h-13 w-13 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="groove-skeleton h-4 w-2/5" />
            <div className="groove-skeleton h-3 w-1/4" />
          </div>
          <div className="groove-skeleton h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-36 shrink-0 space-y-2 sm:w-44">
          <div className="groove-skeleton aspect-square w-full rounded-2xl" />
          <div className="groove-skeleton h-4 w-3/4" />
          <div className="groove-skeleton h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-5 animate-spin rounded-full border-2 border-softwhite/25 border-t-cream",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-softwhite/10 bg-panel px-6 py-12 text-center">
      {icon && <div className="text-midgrey">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {subtitle && <p className="max-w-sm text-sm text-midgrey">{subtitle}</p>}
      {action}
    </div>
  );
}
