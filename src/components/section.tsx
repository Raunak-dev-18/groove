"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Section header with optional "see all" link + horizontal rail. */
export function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 text-sm font-medium text-midgrey transition-colors hover:text-cream"
          >
            See all <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
