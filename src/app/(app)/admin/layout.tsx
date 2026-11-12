"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Music4, Users2, ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { Spinner } from "@/components/skeletons";
import { cn } from "@/lib/utils";

const VIEWER_ROLES = ["moderator", "manager", "admin", "super_admin"];
const EDITOR_ROLES = ["manager", "admin", "super_admin"];
const USER_VIEWER_ROLES = ["manager", "admin", "super_admin"];

/** Guards the admin area — Moderator+ get in, each sees only their tabs. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const role = (session?.user as { role?: string } | undefined)?.role;

  useEffect(() => {
    if (!isPending && session && !VIEWER_ROLES.includes(role ?? "")) {
      router.replace("/home");
    }
  }, [isPending, session, role, router]);

  if (isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!session || !VIEWER_ROLES.includes(role ?? "")) return null;

  const canEdit = EDITOR_ROLES.includes(role ?? "");
  const canViewUsers = USER_VIEWER_ROLES.includes(role ?? "");

  const tabs = [
    { href: "/admin", label: "Dashboard", icon: BarChart3, show: true },
    { href: "/admin/artists", label: "Artists", icon: Users2, show: true },
    { href: "/admin/songs", label: "Songs", icon: Music4, show: true },
    { href: "/admin/users", label: "Users", icon: ShieldCheck, show: canViewUsers },
  ].filter((t) => t.show);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-full border border-cream/30 bg-cream/10 p-1.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-colors",
                active ? "bg-cream text-ink" : "text-mist hover:bg-softwhite/10",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-sm text-midgrey">
        <ShieldCheck className="h-4 w-4 text-cream" />
        {canEdit
          ? "Admin panel — you can create and edit content."
          : "Admin panel — read-only view (Moderator)."}
      </div>
      {children}
    </div>
  );
}
