"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/providers";
import { useSession } from "@/lib/auth-client";
import { Avatar } from "@/components/avatar";
import { RoleBadge } from "@/components/role-badge";
import { SkeletonRowList, EmptyState } from "@/components/skeletons";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "user" | "moderator" | "manager" | "admin" | "super_admin";
  createdAt: string;
}

const ALL_ROLES = [
  { value: "user", label: "User" },
  { value: "moderator", label: "Moderator" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const myRole = (session?.user as { role?: string })?.role ?? "user";
  const isSuper = myRole === "super_admin";
  const isAdmin = isSuper || myRole === "admin";
  // Moderators can't see this page at all (the layout hides the tab)
  // Managers can view but not edit

  // roles the current user can assign
  const assignable = isSuper
    ? ALL_ROLES
    : isAdmin
      ? ALL_ROLES.filter((r) => r.value === "user" || r.value === "admin")
      : [];

  const load = useCallback(() => {
    api<{ users: AdminUser[] }>("/api/admin/users")
      .then((r) => setUsers(r.users))
      .catch((e) => toast((e as Error).message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(load, [load]);

  const setRole = async (u: AdminUser, role: string) => {
    setBusy(u.id);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      setUsers((list) => (list ?? []).map((x) => (x.id === u.id ? { ...x, role: role as AdminUser["role"] } : x)));
      toast(`${u.name} is now ${role === "user" ? "a normal user" : `a ${role}`}`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-mist">
          {isAdmin
            ? "Promote trusted people to Manager or Moderator. Admins can set User/Admin; Super Admins can set all roles."
            : "Read-only view (Manager). Only Admins and Super Admins can change roles."}
        </p>
      </div>

      {users === null ? (
        <SkeletonRowList count={6} />
      ) : users.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-ink/40 bg-panel">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-4 border-b border-softwhite/5 px-4 py-3 last:border-0 sm:px-6"
            >
              <Avatar name={u.name} image={u.image} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-semibold">
                  {u.name}
                  {u.id === session?.user?.id && (
                    <span className="text-xs font-medium text-midgrey">(you)</span>
                  )}
                </p>
                <p className="truncate text-sm text-midgrey">{u.email}</p>
              </div>
              <RoleBadge role={u.role} />

              {isAdmin && assignable.length > 0 && u.role !== "super_admin" && u.id !== session?.user?.id && (
                <div className="flex gap-1.5">
                  {assignable.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRole(u, r.value)}
                      disabled={busy === u.id || u.role === r.value}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                        u.role === r.value
                          ? "bg-cream text-ink"
                          : r.value === "user"
                            ? "border border-softwhite/25 text-mist hover:bg-softwhite/10"
                            : "bg-cream/15 text-cream hover:bg-cream/25"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-midgrey">
        <ShieldCheck className="h-3.5 w-3.5" /> The very first account created on Groove automatically
        became the Super Admin. Role matrix: Moderator = read-only · Manager = edit content ·
        Admin = everything except Super Admin settings · Super Admin = full control.
      </p>
    </div>
  );
}
