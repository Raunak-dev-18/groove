"use client";

import { Check, ChevronDown, Plus, Search, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import type { ArtistDTO } from "@/lib/types";

/**
 * Multi-artist picker: searchable dropdown over the existing roster
 * (avatars included) + "create new" for unknown names. The first selected
 * artist is the primary; the rest are featured.
 */
export function ArtistsSelect({
  artists,
  selectedIds,
  onChange,
  extraNames,
  onExtraNamesChange,
}: {
  artists: ArtistDTO[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  extraNames: string[];
  onExtraNamesChange: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const matched = q
    ? artists.filter((a) => a.name.toLowerCase().includes(q) && !selectedIds.includes(a.id))
    : artists.filter((a) => !selectedIds.includes(a.id));
  const exactExists = q && artists.some((a) => a.name.toLowerCase() === q);
  const exactExtra = q && extraNames.some((n) => n.toLowerCase() === q);
  const canCreate = q && !exactExists && !exactExtra;

  const byId = new Map(artists.map((a) => [a.id, a]));
  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const inputCls =
    "w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-2.5 text-sm placeholder:text-midgrey focus:border-cream/60 focus:outline-none";

  return (
    <div className="space-y-2" ref={rootRef}>
      {/* selected chips — first = primary */}
      {selectedIds.length + extraNames.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id, i) => {
            const a = byId.get(id);
            if (!a) return null;
            return (
              <span
                key={id}
                className="flex items-center gap-2 rounded-full bg-softwhite/10 py-1 pr-2 pl-1"
              >
                <Avatar name={a.name} image={a.avatarFileId} className="h-6 w-6" />
                <span className="max-w-40 truncate text-sm font-semibold">{a.name}</span>
                {i === 0 && (
                  <span className="rounded-full bg-cream px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink uppercase">
                    Primary
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => toggle(id)}
                  className="rounded-full p-0.5 text-midgrey hover:text-softwhite"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
          {extraNames.map((name, i) => (
            <span
              key={name}
              className="flex items-center gap-2 rounded-full bg-cream/15 py-1 pr-2 pl-2"
              title="New artist — created on publish"
            >
              <span className="max-w-40 truncate text-sm font-semibold text-cream">{name}</span>
              {(selectedIds.length === 0 && i === 0) && (
                <span className="rounded-full bg-cream px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink uppercase">
                  Primary
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => onExtraNamesChange(extraNames.filter((x) => x !== name))}
                className="rounded-full p-0.5 text-midgrey hover:text-softwhite"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setQuery("");
          }}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 text-left transition-colors hover:border-cream/40"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-mist">
            <UserPlus className="h-4 w-4" />
            {selectedIds.length + extraNames.length > 0 ? "Add / change artists" : "Select artists"}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-midgrey transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-softwhite/15 bg-panel shadow-2xl">
            <div className="flex items-center gap-2 border-b border-softwhite/10 px-3 py-2.5">
              <Search className="h-4 w-4 text-midgrey" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search artists…"
                className="flex-1 bg-transparent text-sm text-softwhite placeholder:text-midgrey focus:outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {matched.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    toggle(a.id);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-softwhite/5"
                >
                  <Avatar name={a.name} image={a.avatarFileId} className="h-8 w-8" />
                  <span className="flex-1 truncate text-sm font-semibold">{a.name}</span>
                  {a.genre && <span className="text-xs text-midgrey">{a.genre}</span>}
                </button>
              ))}
              {matched.length === 0 && !canCreate && (
                <p className="px-4 py-6 text-center text-sm text-midgrey">
                  {q ? "No other artists match." : "All artists selected."}
                </p>
              )}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    onExtraNamesChange([...extraNames, query.trim()]);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 border-t border-softwhite/10 px-4 py-2.5 text-left transition-colors hover:bg-softwhite/5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream text-ink">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">
                    Create <span className="text-cream">“{query.trim()}”</span>
                    <span className="ml-1 text-xs text-midgrey">(new artist)</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
