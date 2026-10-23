"use client";

import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";
import { Sparkles, ArrowRight, Lock, Mail, User, AlertCircle } from "lucide-react";

interface AuthCardProps {
  initialMode?: "login" | "signup";
}

export default function AuthCard({ initialMode = "login" }: AuthCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("from") || "/projects";

  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password, name);
      }
      router.push(redirectPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    const demoEmail = "developer@codeeditor.io";
    const demoPassword = "Password123!";

    try {
      try {
        await login(demoEmail, demoPassword);
      } catch {
        // If demo user does not exist yet, create it
        await signup(demoEmail, demoPassword, "Demo Developer");
      }
      router.push(redirectPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in with demo account.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white border border-[#eaeaea] rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden font-sans">
      {/* Decorative subtle brand gradient pill */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[var(--color-primary)] via-purple-500 to-indigo-500" />

      {/* Brand Header */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2 mb-3 group">
          <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)] flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4 fill-white" />
          </div>
          <span className="font-bold text-lg text-[#171717] tracking-tight">Code Editor</span>
        </Link>
        <h1 className="text-2xl font-bold text-[#171717] tracking-tight">
          {mode === "login" ? "Welcome back" : "Create your cloud account"}
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          {mode === "login"
            ? "Sign in to access your cloud workspaces and saved projects."
            : "Get started with your collaborative cloud development platform."}
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full bg-[#fbfbfd] border border-[#e5e5e7] focus:border-[var(--color-primary)] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#171717] outline-none transition"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full bg-[#fbfbfd] border border-[#e5e5e7] focus:border-[var(--color-primary)] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#171717] outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#fbfbfd] border border-[#e5e5e7] focus:border-[var(--color-primary)] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#171717] outline-none transition"
            />
          </div>
          {mode === "signup" && (
            <p className="text-[11px] text-neutral-400 mt-1">Must be at least 6 characters long.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60 text-white font-semibold text-xs py-3 rounded-xl transition shadow-md shadow-purple-500/15 flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {isSubmitting ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>{mode === "login" ? "Sign In to Cloud IDE" : "Create Free Account"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-6 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-neutral-200" />
        </div>
        <span className="relative bg-white px-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
          Or continue with
        </span>
      </div>

      {/* Quick 1-click Demo Developer Sign In */}
      <button
        type="button"
        onClick={handleDemoSignIn}
        disabled={isSubmitting}
        className="w-full bg-[#f4f2ff] hover:bg-[#ede9fe] border border-purple-200 text-[var(--color-primary)] font-semibold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Instant Demo Developer Sign In</span>
      </button>

      {/* Toggle mode footer */}
      <div className="text-center mt-6 pt-5 border-t border-[#f0f0f0] text-xs text-neutral-500">
        {mode === "login" ? (
          <p>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("signup");
              }}
              className="font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
            >
              Sign up for free
            </button>
          </p>
        ) : (
          <p>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("login");
              }}
              className="font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
