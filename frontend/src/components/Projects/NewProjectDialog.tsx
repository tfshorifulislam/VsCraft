"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Code2,
  Globe,
  Sparkles,
  Server,
  FileCode,
  Loader2,
  ArrowRight,
  FolderPlus,
  Terminal,
} from "lucide-react";
import { cloudApi } from "@/lib/cloud/cloudApi";
import { ProjectTemplate } from "@/types/editor";

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}

interface TemplateOption {
  id: ProjectTemplate | "blank" | "terminal";
  name: string;
  desc: string;
  tag: string;
  icon: React.ReactNode;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: "terminal",
    name: "Terminal Scaffolding (WebContainer)",
    desc: "Interactive in-browser WebContainer terminal. Run npm create vite, npx create-next-app, or npm init directly.",
    tag: "Interactive",
    icon: <Terminal className="w-5 h-5 text-emerald-400" />,
  },
  {
    id: "react-ts",
    name: "React + TypeScript",
    desc: "Interactive React 19 app with Vite, TypeScript, and modern component tooling.",
    tag: "Popular",
    icon: <Code2 className="w-5 h-5 text-cyan-400" />,
  },
  {
    id: "next-app",
    name: "Next.js App",
    desc: "Fullstack Next.js project with App Router, server-rendered layouts, and Tailwind.",
    tag: "Fullstack",
    icon: <Sparkles className="w-5 h-5 text-amber-400" />,
  },
  {
    id: "vanilla-web",
    name: "Modern Vanilla Web",
    desc: "Clean HTML5, responsive CSS grid, and JavaScript with instant in-browser preview.",
    tag: "Lightweight",
    icon: <Globe className="w-5 h-5 text-emerald-400" />,
  },
  {
    id: "node-api",
    name: "Node.js REST API",
    desc: "Express server with JSON routing, middleware, and fast in-browser WebContainer execution.",
    tag: "Backend",
    icon: <Server className="w-5 h-5 text-indigo-400" />,
  },
  {
    id: "blank",
    name: "Empty Workspace",
    desc: "Completely blank workspace ready for custom file trees and manual setup.",
    tag: "Custom",
    icon: <FileCode className="w-5 h-5 text-neutral-400" />,
  },
];

export default function NewProjectDialog({
  isOpen,
  onClose,
  onCreated,
}: NewProjectDialogProps) {
  const router = useRouter();
  const [projectName, setProjectName] = useState("my-app");
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | "blank" | "terminal">("terminal");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || isCreating) return;

    setIsCreating(true);
    setErrorMsg(null);

    try {
      let created;
      if (selectedTemplate === "terminal" || selectedTemplate === "blank") {
        created = await cloudApi.projects.create({
          type: "blank",
          blankSubtype: "empty",
          name: projectName.trim(),
          description:
            selectedTemplate === "terminal"
              ? "Terminal-based project created with WebContainer runtime"
              : "Empty workspace ready for custom files",
        });
      } else {
        created = await cloudApi.projects.create({
          type: "template",
          template: selectedTemplate,
          name: projectName.trim(),
          description: `${projectName} created from ${selectedTemplate} template`,
        });
      }

      onClose();
      if (onCreated) {
        onCreated(created.id);
      } else {
        router.push(`/editor/${encodeURIComponent(created.id)}?init=terminal`);
      }
    } catch (err) {
      console.error("Project creation error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to create project");
      setIsCreating(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#14151a] border border-[#2b2b36] rounded-2xl shadow-2xl flex flex-col text-neutral-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2b2b36] bg-[#1a1b22]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Create New Project</h3>
              <p className="text-[11px] text-neutral-400">
                Choose a template to mount into browser WebContainer
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-5 space-y-4">
          {/* Project Name Field */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-cool-project"
              className="w-full px-3 py-2 bg-[#1b1c24] border border-[#343542] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--color-primary)] transition"
            />
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              Select Runtime Starter Template
            </label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {TEMPLATE_OPTIONS.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/70 text-white"
                        : "bg-[#181920] border-[#292a34] text-neutral-300 hover:border-[#3d3f4e] hover:bg-[#1c1d25]"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-[#22232c] shrink-0 mt-0.5">
                      {tpl.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{tpl.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                          {tpl.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">
                        {tpl.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs font-mono">
              {errorMsg}
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !projectName.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              <span>{isCreating ? "Creating Project..." : "Create & Launch"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
