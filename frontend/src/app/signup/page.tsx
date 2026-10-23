import React, { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/Auth/AuthCard";

export const metadata: Metadata = {
  title: "Create Account — Code Editor Cloud",
  description: "Create an account to start building and saving projects in the cloud.",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#fafafc]">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white border border-[#eaeaea] rounded-3xl p-10 shadow-2xl h-96 flex items-center justify-center">
            <span className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <AuthCard initialMode="signup" />
      </Suspense>
    </div>
  );
}
