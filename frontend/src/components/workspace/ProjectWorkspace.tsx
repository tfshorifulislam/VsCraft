"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Code2, TerminalSquare } from "lucide-react";
import TerminalPanel from "@/components/terminal/Terminal";
import CodeEditor from "@/components/editor/CodeEditor";

interface ProjectWorkspaceProps {
  projectId: string;
  projectName: string;
  initialTab: "terminal" | "editor";
}

export default function ProjectWorkspace({
  projectId,
  projectName,
  initialTab,
}: ProjectWorkspaceProps) {
  const [tab, setTab] = useState<"terminal" | "editor">(initialTab);

  return (
    <div className="flex h-screen flex-col bg-[#1e1e1e] text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-[#2d2d2d] bg-[#252526] px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[#aaaaaa] transition hover:bg-[#37373d] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Projects
          </Link>
          <span className="h-4 w-px bg-[#3c3c3c]" />
          <span className="truncate text-xs font-medium text-[#cccccc]">
            {projectName}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-[#1e1e1e] p-1">
          <button
            type="button"
            onClick={() => setTab("terminal")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition ${
              tab === "terminal"
                ? "bg-[#37373d] text-white"
                : "text-[#9d9d9d] hover:text-white"
            }`}
          >
            <TerminalSquare className="h-3.5 w-3.5" />
            Terminal
          </button>
          <button
            type="button"
            onClick={() => setTab("editor")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition ${
              tab === "editor"
                ? "bg-[#37373d] text-white"
                : "text-[#9d9d9d] hover:text-white"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Editor
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#8a8a8a]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Database-backed
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        <div
          className={`absolute inset-0 ${tab === "terminal" ? "" : "hidden"}`}
        >
          <TerminalPanel
            projectId={projectId}
            onOpenEditor={() => setTab("editor")}
          />
        </div>

        {tab === "editor" && (
          <div className="absolute inset-0">
            <CodeEditor projectId={projectId} />
          </div>
        )}
      </main>
    </div>
  );
}
