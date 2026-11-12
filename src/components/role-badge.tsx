import { cn } from "@/lib/utils";

/** Role badge — small pill with a subtle color per role. */
export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const styles: Record<string, string> = {
    super_admin: "bg-cream text-ink",
    admin: "bg-mist text-ink",
    manager: "bg-mist/60 text-ink",
    moderator: "bg-ctlgrey text-softwhite",
  };
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    manager: "Manager",
    moderator: "Moderator",
  };
  if (!styles[role]) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
        styles[role],
        className,
      )}
    >
      {labels[role]}
    </span>
  );
}
