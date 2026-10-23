import React, { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/Auth/AuthCard";

export const metadata: Metadata = {
  title: "Sign In — Code Editor Cloud",
  description: "Sign in to access your cloud workspaces and projects.",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#fafafc]">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white border border-[#eaeaea] rounded-3xl p-10 shadow-2xl h-96 flex items-center justify-center">
            <span className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <AuthCard initialMode="login" />
      </Suspense>
    </div>
  );
}
