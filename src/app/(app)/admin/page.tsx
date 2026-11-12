"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AudioLines,
  Database,
  Heart,
  HardDrive,
  Music4,
  PlayCircle,
  Users2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/providers";
import { Spinner, EmptyState } from "@/components/skeletons";
import { RoleBadge } from "@/components/role-badge";
import { formatCount } from "@/lib/utils";

interface Stats {
  totals: {
    users: number;
    artists: number;
    songs: number;
    likes: number;
    plays: number;
    blends: number;
    activeJams: number;
  };
  recentUsers: { id: string; name: string; email: string; role: string; createdAt: string }[];
  topSongs: { id: string; title: string; plays: number; artistName: string }[];
}

type HealthReport = Record<string, unknown>;

export default function AdminDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api<Stats>("/api/admin/stats").then(setStats).catch((e) => toast((e as Error).message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const r = await api<HealthReport>("/api/cdn/health");
      setHealth(r);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setChecking(false);
    }
  };

  const cards = [
    { label: "Users", value: stats?.totals.users, icon: Users2, href: "/admin/users" },
    { label: "Artists", value: stats?.totals.artists, icon: Users2, href: "/admin/artists" },
    { label: "Songs", value: stats?.totals.songs, icon: Music4, href: "/admin/songs" },
    { label: "Plays", value: stats?.totals.plays, icon: PlayCircle },
    { label: "Likes", value: stats?.totals.likes, icon: Heart },
    { label: "Active Jams", value: stats?.totals.activeJams, icon: AudioLines },
    { label: "Blends", value: stats?.totals.blends, icon: Activity },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Admin dashboard</h1>
        <p className="mt-1 text-sm text-mist">Manage Groove: artists, music, users, and storage.</p>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map(({ label, value, icon: Icon, href }) => {
          const inner = (
            <div className="rounded-3xl border border-ink/40 bg-panel p-5 transition-colors hover:bg-softwhite/5">
              <Icon className="h-5 w-5 text-cream" />
              <p className="mt-3 text-2xl font-extrabold tabular-nums">
                {value === undefined ? "…" : formatCount(value)}
              </p>
              <p className="text-xs font-semibold text-midgrey">{label}</p>
            </div>
          );
          return href ? (
            <Link key={label} href={href}>
              {inner}
            </Link>
          ) : (
            <div key={label}>{inner}</div>
          );
        })}
      </div>

      {/* storage health */}
      <section className="space-y-3 rounded-3xl border border-ink/40 bg-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <HardDrive className="h-5 w-5 text-cream" /> Storage health
          </h2>
          <button
            onClick={checkHealth}
            disabled={checking}
            className="flex items-center gap-2 rounded-full border border-softwhite/20 px-4 py-2 text-sm font-semibold text-mist transition-colors hover:bg-softwhite/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Run check"}
          </button>
        </div>
        {!health ? (
          <p className="text-sm text-midgrey">
            Run a check to verify that uploads and downloads work end-to-end on both providers —
            uploads fall back to local storage automatically if the primary provider fails.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["local", "dropin"] as const).map((k) => {
              const v = String(health[k] ?? "unknown");
              const ok = v === "ok";
              return (
                <div
                  key={k}
                  className={`rounded-2xl border p-4 ${
                    ok ? "border-cream/30 bg-cream/5" : "border-red-300/30 bg-red-400/5"
                  }`}
                >
                  <p className="flex items-center gap-2 font-semibold">
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 text-cream" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-300" />
                    )}
                    {k === "dropin" ? "Dropin CDN API" : "Local fallback store"}
                  </p>
                  <p className="mt-1 text-sm text-mist">{v}</p>
                </div>
              );
            })}
            {typeof health.provider === "string" && (
              <p className="text-xs text-midgrey sm:col-span-2">
                Active upload provider: <strong>{health.provider}</strong> · uploads automatically
                fall back to local storage if the primary provider fails.
              </p>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* recent users */}
        <section className="space-y-3 rounded-3xl border border-ink/40 bg-panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Users2 className="h-5 w-5 text-cream" /> New users
          </h2>
          {!stats ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{u.name}</p>
                    <p className="truncate text-xs text-midgrey">{u.email}</p>
                  </div>
                  <RoleBadge role={u.role} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* top songs */}
        <section className="space-y-3 rounded-3xl border border-ink/40 bg-panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <PlayCircle className="h-5 w-5 text-cream" /> Most played
          </h2>
          {!stats ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : stats.topSongs.length === 0 ? (
            <EmptyState title="No plays yet" subtitle="Upload music and share the app to get started." />
          ) : (
            <div className="space-y-3">
              {stats.topSongs.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-5 text-right font-bold text-midgrey tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="truncate text-xs text-midgrey">{s.artistName}</p>
                  </div>
                  <span className="text-sm font-bold text-cream tabular-nums">
                    {formatCount(s.plays)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="flex items-center gap-2 text-xs text-midgrey">
        <Database className="h-3.5 w-3.5" /> Connected to Neon PostgreSQL · Storage via Dropin CDN
        proxy with local fallback
      </p>
    </div>
  );
}
