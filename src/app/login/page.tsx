"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Music4 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@/components/skeletons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Could not sign in — check your email and password");
      return;
    }
    router.replace("/home");
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cream text-ink">
          <Music4 className="h-6 w-6" fill="currentColor" />
        </span>
        <span className="text-3xl font-extrabold tracking-tight">Groove</span>
      </Link>

      <form
        onSubmit={submit}
        className="w-full space-y-4 rounded-3xl border border-ink/40 bg-panel p-6 sm:p-8"
      >
        <h1 className="text-xl font-bold">Welcome back</h1>

        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-mist">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 text-softwhite placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-mist">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full rounded-xl border border-softwhite/15 bg-brand-deep/50 px-4 py-3 text-softwhite placeholder:text-midgrey focus:border-cream/60 focus:outline-none"
          />
        </label>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-cream py-3 font-bold text-ink transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          {loading && <Spinner className="h-4 w-4 border-ink/30 border-t-ink" />}
          Sign in
        </button>

        <p className="text-center text-sm text-midgrey">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-cream hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </main>
  );
}
