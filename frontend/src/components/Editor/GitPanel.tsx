"use client";

import React, { useState, type MouseEvent, type FormEvent } from "react";
import {
  GitBranch,
  Plus,
  Minus,
  Check,
  History,
  FileCode,
} from "lucide-react";
import { Project, GitCommitRecord } from "@/types/editor";

const INITIAL_COMMITS: GitCommitRecord[] = [
  {
    id: "c-init",
    hash: "7f4a1c9",
    message: "feat: initialize cloud workspace template",
    author: "Developer",
    timestamp: 1710000000000,
    branch: "main",
  },
];

interface GitPanelProps {
  project: Project;
  unsavedFiles: Record<string, boolean>;
  onSelectFile: (fileId: string) => void;
  onCommitSuccess?: (msg: string) => void;
}

export default function GitPanel({
  project,
  unsavedFiles,
  onSelectFile,
  onCommitSuccess,
}: GitPanelProps) {
  const branch = "main";
  const [commitMessage, setCommitMessage] = useState("");
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [commits, setCommits] = useState<GitCommitRecord[]>(INITIAL_COMMITS);

  // Derive changes based on unsaved files or all files if newly created
  const modifiedFiles = project.files.filter((f) => !f.isFolder && (unsavedFiles[f.id] || true));

  const stagedFiles = modifiedFiles.filter((f) => stagedIds.has(f.id));
  const unstagedFiles = modifiedFiles.filter((f) => !stagedIds.has(f.id));

  const handleStage = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setStagedIds((prev) => new Set([...prev, id]));
  };

  const handleUnstage = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setStagedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
  };

  const handleStageAll = () => {
    setStagedIds(new Set(modifiedFiles.map((f) => f.id)));
  };

  const handleUnstageAll = () => {
    setStagedIds(new Set());
  };

  const handleCommit = (e: FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;

    const newCommit: GitCommitRecord = {
      id: `c-${Date.now()}`,
      hash: Math.random().toString(16).substring(2, 9),
      message: commitMessage.trim(),
      author: "Developer",
      timestamp: Date.now(),
      branch,
    };

    setCommits([newCommit, ...commits]);
    setCommitMessage("");
    setStagedIds(new Set());
    if (onCommitSuccess) onCommitSuccess(newCommit.message);
  };

  return (
    <div className="h-full flex flex-col bg-[#252526] text-neutral-300 font-sans text-xs select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#1e1e1e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-emerald-400" />
          <span className="font-bold uppercase tracking-wider text-[11px] text-neutral-300">
            Source Control
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#1e1e1e] text-[10px] font-mono text-neutral-400">
          <span>branch:</span>
          <span className="text-white font-semibold">{branch}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Commit Box */}
        <form onSubmit={handleCommit} className="space-y-2">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Message (Ctrl+Enter to commit)"
            rows={3}
            className="w-full bg-[#1e1e1e] border border-[#383838] focus:border-[var(--color-primary)] rounded-lg p-2.5 text-xs text-white outline-none resize-none font-mono placeholder:text-neutral-500"
          />
          <button
            type="submit"
            disabled={!commitMessage.trim() || stagedFiles.length === 0}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40 text-white font-semibold py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Commit ({stagedFiles.length})</span>
          </button>
        </form>

        {/* Staged Changes Section */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            <span>Staged Changes ({stagedFiles.length})</span>
            {stagedFiles.length > 0 && (
              <button
                type="button"
                onClick={handleUnstageAll}
                title="Unstage All Changes"
                className="hover:text-white p-0.5 rounded transition cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-0.5">
            {stagedFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className="flex items-center justify-between p-1.5 rounded hover:bg-[#2a2d2e] cursor-pointer group font-mono text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-white truncate">{file.name}</span>
                  <span className="text-[10px] text-neutral-500 truncate">{file.path}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-emerald-400 font-bold px-1 rounded bg-emerald-500/10">
                    S
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleUnstage(file.id, e)}
                    title="Unstage"
                    className="p-1 hover:text-white text-neutral-400 rounded opacity-0 group-hover:opacity-100 transition"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {stagedFiles.length === 0 && (
              <p className="text-[11px] text-neutral-500 italic px-1 py-1">
                No changes staged for commit.
              </p>
            )}
          </div>
        </div>

        {/* Changes Section */}
        <div className="space-y-1.5 pt-2 border-t border-[#333333]">
          <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            <span>Changes ({unstagedFiles.length})</span>
            {unstagedFiles.length > 0 && (
              <button
                type="button"
                onClick={handleStageAll}
                title="Stage All Changes"
                className="hover:text-white p-0.5 rounded transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-0.5">
            {unstagedFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className="flex items-center justify-between p-1.5 rounded hover:bg-[#2a2d2e] cursor-pointer group font-mono text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-neutral-200 truncate">{file.name}</span>
                  <span className="text-[10px] text-neutral-500 truncate">{file.path}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-amber-400 font-bold px-1 rounded bg-amber-500/10">
                    M
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleStage(file.id, e)}
                    title="Stage"
                    className="p-1 hover:text-white text-neutral-400 rounded opacity-0 group-hover:opacity-100 transition"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commit History Timeline */}
        <div className="space-y-2 pt-3 border-t border-[#333333]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            <History className="w-3.5 h-3.5" />
            <span>Commit History</span>
          </div>
          <div className="space-y-1.5">
            {commits.map((c) => (
              <div
                key={c.id}
                className="p-2 rounded bg-[#1e1e1e] border border-[#333333] space-y-1 text-[11px] font-mono"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-primary)] font-bold">{c.hash}</span>
                  <span className="text-[10px] text-neutral-500">
                    {new Date(c.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-neutral-200 font-sans text-xs">{c.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
