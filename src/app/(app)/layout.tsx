"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { Sidebar } from "@/components/sidebar";
import { PlayerBar } from "@/components/player-bar";
import { Spinner } from "@/components/skeletons";

/** Authenticated app shell: sidebar + content + global player bar. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-28" key={pathname}>
        <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-8">{children}</div>
      </main>
      <PlayerBar />
    </div>
  );
}
