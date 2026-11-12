"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** Centered modal panel on a dark overlay. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-90 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`max-h-[85vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-3xl border border-softwhite/10 bg-panel p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-midgrey transition-colors hover:bg-softwhite/10 hover:text-softwhite"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
