"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const isLogin = mode === "login";
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiFetch(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(
          isLogin ? { email, password } : { name, email, password }
        ),
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f5f5f5]">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#0d0d0d] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 500px at 20% 10%, rgba(13,153,255,0.35), transparent 60%), radial-gradient(700px 500px at 90% 90%, rgba(255,60,172,0.28), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3 text-lg font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-black">
            CF
          </span>
          CodeFigma
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Design, code, and ship from one canvas.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            A Figma-style workspace with a VS Code-grade editor and a real
            terminal. Projects live in your database, never on the server disk.
          </p>
        </div>
        <div className="relative text-xs text-white/40">
          Browser-based · Serverless-ready · Real PTY
        </div>
      </aside>

      <main className="flex w-full flex-1 items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">
              CF
            </span>
            <span className="text-base font-semibold">CodeFigma</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-[#1e1e1e]">
            {isLogin ? "Sign in to CodeFigma" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-[#6b6b6b]">
            {isLogin
              ? "Continue to your projects and workspace."
              : "Start building in the browser in seconds."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {!isLogin && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#3c3c3c]">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                  placeholder="Ada Lovelace"
                  className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#0d99ff] focus:ring-2 focus:ring-[#0d99ff]/20"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#3c3c3c]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#0d99ff] focus:ring-2 focus:ring-[#0d99ff]/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#3c3c3c]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#0d99ff] focus:ring-2 focus:ring-[#0d99ff]/20"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0d99ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b87e3] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait…"
                : isLogin
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[#6b6b6b]">
            {isLogin ? "New to CodeFigma?" : "Already have an account?"}{" "}
            <Link
              href={isLogin ? "/signup" : "/login"}
              className="font-medium text-[#0d99ff] hover:underline"
            >
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
