"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface NewProjectButtonProps {
  variant?: "primary" | "tile";
}

export default function NewProjectButton({
  variant = "primary",
}: NewProjectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createProject() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "Untitled Project" }),
      });
      router.push(`/project/${data.project.id}?tab=terminal`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Could not create project."
      );
      setLoading(false);
    }
  }

  if (variant === "tile") {
    return (
      <button
        type="button"
        onClick={createProject}
        disabled={loading}
        className="group flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#d9d9d9] bg-white p-6 text-center transition hover:border-[#0d99ff] hover:bg-[#f7fbff] disabled:opacity-60"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f0f0f0] text-[#6b6b6b] transition group-hover:bg-[#0d99ff] group-hover:text-white">
          <Plus className="h-6 w-6" />
        </span>
        <span className="text-sm font-semibold text-[#1e1e1e]">
          {loading ? "Creating…" : "New project"}
        </span>
        <span className="text-xs text-[#8a8a8a]">
          Opens a fresh terminal session
        </span>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={createProject}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-[#0d99ff] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b87e3] disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {loading ? "Creating…" : "New Project"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
