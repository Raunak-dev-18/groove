"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AudioLines,
  Heart,
  Home,
  Library,
  LogOut,
  Music4,
  Search,
  Settings2,
  Users2,
} from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { Avatar } from "@/components/avatar";
import { RoleBadge } from "@/components/role-badge";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/artists", label: "Artists", icon: Users2 },
  { href: "/library", label: "Library", icon: Library },
  { href: "/jam", label: "Jam", icon: AudioLines },
  { href: "/blend", label: "Blend", icon: Heart },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  const isAdmin = ["moderator", "manager", "admin", "super_admin"].includes(role);

  return (
    <aside className="flex h-full w-16 shrink-0 flex-col gap-2 border-r border-ink/40 bg-panel p-2 sm:w-60 sm:p-3">
      <Link href="/home" className="flex items-center gap-2 px-2 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream text-ink">
          <Music4 className="h-5 w-5" fill="currentColor" />
        </span>
        <span className="hidden text-xl font-extrabold tracking-tight sm:block">Groove</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2.5 font-semibold transition-colors",
                active
                  ? "bg-brand text-softwhite"
                  : "text-midgrey hover:bg-softwhite/5 hover:text-softwhite",
              )}
              title={label}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden sm:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Role-based admin section */}
      {isAdmin && (
        <div className="mt-2 border-t border-softwhite/10 pt-2">
          <p className="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-midgrey uppercase sm:block">
            Manage
          </p>
          {[
            { href: "/admin", label: "Dashboard", icon: Settings2 },
            { href: "/admin/artists", label: "Artists", icon: Users2 },
            { href: "/admin/songs", label: "Songs", icon: Music4 },
          ].map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3 py-2.5 font-semibold transition-colors",
                  active
                    ? "bg-cream text-ink"
                    : "text-midgrey hover:bg-softwhite/5 hover:text-softwhite",
                )}
                title={label}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden sm:block">{label}</span>
              </Link>
            );
          })}
          <Link
            href="/admin/users"
            className={cn(
              "mt-1 flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-semibold transition-colors",
              pathname === "/admin/users"
                ? "bg-cream text-ink"
                : "text-midgrey hover:bg-softwhite/5 hover:text-softwhite",
            )}
            title="Users"
          >
            <Users2 className="h-5 w-5 shrink-0" />
            <span className="hidden sm:block">Users</span>
            {role === "super_admin" && <span className="hidden sm:block"><RoleBadge role={role} /></span>}
          </Link>
        </div>
      )}

      <div className="mt-auto">
        {session?.user && (
          <div className="flex items-center gap-2 rounded-full bg-brand-deep/60 p-2">
            <Avatar
              name={session.user.name}
              image={session.user.image}
              className="h-9 w-9"
            />
            <div className="hidden min-w-0 flex-1 sm:block">
              <div className="truncate text-sm font-semibold">{session.user.name}</div>
              <RoleBadge role={role} />
            </div>
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await authClient.signOut();
                router.replace("/login");
              }}
              className="rounded-full p-2 text-midgrey transition-colors hover:bg-softwhite/10 hover:text-softwhite"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
