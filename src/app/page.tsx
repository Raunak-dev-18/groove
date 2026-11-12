"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AudioLines, Heart, Music4, Radio, Users2 } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { Spinner } from "@/components/skeletons";

/** Landing — redirects signed-in users to /home. */
export default function LandingPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setChecked(true);
      if (session) router.replace("/home");
    }
  }, [isPending, session, router]);

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cream text-ink">
          <Music4 className="h-7 w-7" fill="currentColor" />
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight">Groove</h1>
      </div>

      <p className="max-w-xl text-xl text-mist">
        Stream music together. Host live <span className="font-bold text-cream">Jams</span> with
        friends, <span className="font-bold text-cream">Blend</span> your tastes, and follow the
        artists you love.
      </p>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Radio, label: "Live Jams" },
          { icon: AudioLines, label: "Group chat" },
          { icon: Heart, label: "Taste blends" },
          { icon: Users2, label: "Follow artists" },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 rounded-3xl border border-ink/40 bg-panel px-3 py-5"
          >
            <Icon className="h-6 w-6 text-cream" />
            <span className="text-sm font-semibold text-mist">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/signup"
          className="rounded-full bg-cream px-8 py-3 font-bold text-ink transition-transform hover:scale-105"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-softwhite/30 px-8 py-3 font-bold text-softwhite transition-colors hover:bg-softwhite/10"
        >
          Sign in
        </Link>
      </div>

      <p className="text-xs text-midgrey">First account created becomes the Super Admin.</p>
    </main>
  );
}
