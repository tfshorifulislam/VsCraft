"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cloudApi } from "@/lib/cloud/cloudApi";

export default function EditorPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirectRecent() {
      try {
        const user = await cloudApi.auth.getMe();
        if (!user) {
          router.replace("/login?from=/editor");
          return;
        }

        const projects = await cloudApi.projects.list("recent");
        if (projects && projects.length > 0) {
          router.replace(`/editor/${projects[0].id}`);
        } else {
          router.replace("/projects");
        }
      } catch {
        router.replace("/login?from=/editor");
      }
    }
    redirectRecent();
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#1e1e1e] text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="text-xs text-neutral-400">Loading your workspace...</span>
      </div>
    </div>
  );
}
