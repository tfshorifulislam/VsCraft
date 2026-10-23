"use client";

import React, { useState } from "react";
import {
  X,
  Sparkles,
  Layers,
  FileCode,
  Server,
  Terminal,
  CheckCircle2,
  Loader2,
  AlertCircle,
  PlusCircle,
  Check,
  FolderGit2,
} from "lucide-react";
import {
  Project,
  FrameworkInitType,
  FrameworkInitOptions,
  NextJsConfig,
} from "@/types/editor";
import { cloudApi } from "@/lib/cloud/cloudApi";

interface InitializeProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onInitialized: (updatedProject: Project) => void;
}

export default function InitializeProjectDialog({
  isOpen,
  onClose,
  project,
  onInitialized,
}: InitializeProjectDialogProps) {
  // Determine project state
  const hasFiles = project.files.length > 0;
  const isNextJs = project.files.some(
    (f) =>
      f.path.includes("next.config") ||
      f.path.startsWith("app/") ||
      (f.path === "package.json" && f.content.includes('"next"'))
  );
  const hasShadcn = project.files.some(
    (f) => f.path === "components.json" || f.path.startsWith("components/ui/")
  );
  const hasTailwind = project.files.some(
    (f) => f.path.includes("tailwind.config") || (f.path === "package.json" && f.content.includes("tailwindcss"))
  );

  const [activeTab, setActiveTab] = useState<"framework" | "tooling">(
    !hasFiles || !isNextJs ? "framework" : hasShadcn ? "framework" : "tooling"
  );

  // Framework selection
  const [selectedFramework, setSelectedFramework] = useState<FrameworkInitType>("nextjs");
  const [nextConfig, setNextConfig] = useState<NextJsConfig>({
    typescript: true,
    tailwind: true,
    shadcn: true,
    eslint: true,
    packageManager: "npm",
  });

  // Tooling selection
  const [selectedTooling, setSelectedTooling] = useState<FrameworkInitType>("add-shadcn");

  // Loading & error state
  const [isLoading, setIsLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExecute = async () => {
    setIsLoading(true);
    setError(null);
    setProgressStage("Preparing project files...");

    try {
      const isTooling = activeTab === "tooling";
      const initType: FrameworkInitType = isTooling ? selectedTooling : selectedFramework;

      const options: FrameworkInitOptions = {
        type: initType,
      };

      if (initType === "nextjs") {
        options.nextConfig = nextConfig;
      }

      // Staged progress feedback
      const timer1 = setTimeout(() => setProgressStage("Generating configurations & component dependencies..."), 500);
      const timer2 = setTimeout(() => setProgressStage("Syncing with cloud workspace..."), 1100);

      const updatedProject = await cloudApi.projects.initialize(project.id, options);

      clearTimeout(timer1);
      clearTimeout(timer2);

      setProgressStage("Finalizing workspace...");
      setTimeout(() => {
        setIsLoading(false);
        onInitialized(updatedProject);
        onClose();
      }, 400);
    } catch (err: unknown) {
      console.error("Framework initialization error:", err);
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Failed to initialize framework.");
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#1e1e1e] border border-[#3c3c3c] rounded-2xl shadow-2xl overflow-hidden text-neutral-300 font-sans flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2d2d2d] flex items-center justify-between bg-[#252526]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Project Setup & Framework Configuration</span>
              </h3>
              <p className="text-xs text-neutral-400">
                Configure tools, initialize frameworks, or add shadcn/ui to <span className="font-semibold text-neutral-300">{project.name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 hover:text-white rounded-lg hover:bg-[#333333] transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Callout if Empty or Next.js */}
        <div className="px-6 pt-4 pb-1">
          {!hasFiles ? (
            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/60 flex items-start gap-3">
              <FolderGit2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-blue-200">Empty Workspace Detected:</span>
                <p className="text-blue-300/80 mt-0.5">
                  Select a starter framework below to automatically scaffold your project structure, configuration files, and tools.
                </p>
              </div>
            </div>
          ) : isNextJs && !hasShadcn ? (
            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/60 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <div className="text-xs flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-purple-200">Next.js Project Detected</span>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-medium">Recommended</span>
                </div>
                <p className="text-purple-300/80 mt-0.5">
                  You can add shadcn/ui components (`Button`, `Card`, and `utils.ts`) without modifying or deleting your existing pages.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Navigation Tabs */}
        {hasFiles && (
          <div className="px-6 pt-3">
            <div className="flex gap-2 border-b border-[#2d2d2d] pb-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("framework")}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === "framework"
                    ? "bg-[#333333] text-white"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-[#252526]"
                }`}
              >
                Initialize / Replace Framework
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tooling")}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "tooling"
                    ? "bg-[#333333] text-white"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-[#252526]"
                }`}
              >
                <span>Add Tooling & Libraries</span>
                {!hasShadcn && isNextJs && (
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === "framework" ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider block mb-2">
                  Select Framework:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Next.js */}
                  <div
                    onClick={() => setSelectedFramework("nextjs")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition text-left flex items-start gap-3 ${
                      selectedFramework === "nextjs"
                        ? "bg-[#28282b] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                        : "bg-[#252526] border-[#333333] hover:border-[#444444]"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-neutral-800 text-white shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Next.js App Router</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">v16</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                        Fullstack React with Server Components, Tailwind CSS, and shadcn/ui.
                      </p>
                    </div>
                  </div>

                  {/* React Vite */}
                  <div
                    onClick={() => setSelectedFramework("react-vite")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition text-left flex items-start gap-3 ${
                      selectedFramework === "react-vite"
                        ? "bg-[#28282b] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                        : "bg-[#252526] border-[#333333] hover:border-[#444444]"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 shrink-0">
                      <FileCode className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">React 19 + Vite</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">Vite 6</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                        Fast single-page application with TypeScript and hot reloading.
                      </p>
                    </div>
                  </div>

                  {/* Node Express */}
                  <div
                    onClick={() => setSelectedFramework("nodejs")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition text-left flex items-start gap-3 ${
                      selectedFramework === "nodejs"
                        ? "bg-[#28282b] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                        : "bg-[#252526] border-[#333333] hover:border-[#444444]"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-emerald-950/60 text-emerald-400 shrink-0">
                      <Server className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Node.js & Express</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">API</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                        RESTful backend server with modular JSON routes and middleware.
                      </p>
                    </div>
                  </div>

                  {/* Python */}
                  <div
                    onClick={() => setSelectedFramework("python")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition text-left flex items-start gap-3 ${
                      selectedFramework === "python"
                        ? "bg-[#28282b] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                        : "bg-[#252526] border-[#333333] hover:border-[#444444]"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-amber-950/60 text-amber-400 shrink-0">
                      <Terminal className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Python 3 Service</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">py3</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                        Python service with entry point and requirements.txt.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next.js Configuration Options */}
              {selectedFramework === "nextjs" && (
                <div className="p-4 rounded-xl bg-[#252526] border border-[#333333] space-y-3">
                  <span className="text-xs font-bold text-white block">
                    Next.js Framework Options
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={nextConfig.typescript}
                        onChange={(e) => setNextConfig((prev) => ({ ...prev, typescript: e.target.checked }))}
                        className="rounded border-[#444] text-[var(--color-primary)] focus:ring-0 bg-[#1e1e1e]"
                      />
                      <span>TypeScript</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={nextConfig.tailwind}
                        onChange={(e) => setNextConfig((prev) => ({ ...prev, tailwind: e.target.checked }))}
                        className="rounded border-[#444] text-[var(--color-primary)] focus:ring-0 bg-[#1e1e1e]"
                      />
                      <span>Tailwind CSS</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-purple-300 font-medium cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={nextConfig.shadcn}
                        onChange={(e) => setNextConfig((prev) => ({ ...prev, shadcn: e.target.checked }))}
                        className="rounded border-[#444] text-purple-500 focus:ring-0 bg-[#1e1e1e]"
                      />
                      <span>shadcn/ui (Button & Card)</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={nextConfig.eslint}
                        onChange={(e) => setNextConfig((prev) => ({ ...prev, eslint: e.target.checked }))}
                        className="rounded border-[#444] text-[var(--color-primary)] focus:ring-0 bg-[#1e1e1e]"
                      />
                      <span>ESLint</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Tooling Tab */
            <div className="space-y-4">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider block">
                Available Add-ons for Existing Projects:
              </label>

              {/* Add shadcn/ui Card */}
              <div
                onClick={() => setSelectedTooling("add-shadcn")}
                className={`p-4 rounded-xl border cursor-pointer transition text-left flex items-start gap-3.5 ${
                  selectedTooling === "add-shadcn"
                    ? "bg-[#28282b] border-purple-500 ring-1 ring-purple-500"
                    : "bg-[#252526] border-[#333333] hover:border-[#444444]"
                }`}
              >
                <div className="p-2.5 rounded-lg bg-purple-950/60 text-purple-400 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">shadcn/ui Component System</span>
                    {hasShadcn ? (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Already Installed</span>
                    ) : (
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-medium">Ready to Install</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Adds <code className="text-purple-300">components.json</code>, <code className="text-purple-300">@/lib/utils.ts</code>, <code className="text-purple-300">Button</code>, and <code className="text-purple-300">Card</code> components. Updates package.json with Radix and Lucide dependencies.
                  </p>
                  <div className="mt-2 text-[11px] text-neutral-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Safe addition: all existing pages and files are strictly preserved.</span>
                  </div>
                </div>
              </div>

              {/* Add Tailwind CSS Card */}
              <div
                onClick={() => setSelectedTooling("add-tailwind")}
                className={`p-4 rounded-xl border cursor-pointer transition text-left flex items-start gap-3.5 ${
                  selectedTooling === "add-tailwind"
                    ? "bg-[#28282b] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                    : "bg-[#252526] border-[#333333] hover:border-[#444444]"
                }`}
              >
                <div className="p-2.5 rounded-lg bg-cyan-950/60 text-cyan-400 shrink-0">
                  <FileCode className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Tailwind CSS v3 Setup</span>
                    {hasTailwind && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Configured</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    Adds <code className="text-cyan-300">tailwind.config.ts</code> and <code className="text-cyan-300">postcss.config.js</code> with standard content paths.
                  </p>
                </div>
              </div>

              {/* Add ESLint Card */}
              <div
                onClick={() => setSelectedTooling("add-eslint")}
                className={`p-4 rounded-xl border cursor-pointer transition text-left flex items-start gap-3.5 ${
                  selectedTooling === "add-eslint"
                    ? "bg-[#28282b] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                    : "bg-[#252526] border-[#333333] hover:border-[#444444]"
                }`}
              >
                <div className="p-2.5 rounded-lg bg-neutral-800 text-neutral-300 shrink-0">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-bold text-white">ESLint Configuration</span>
                  <p className="text-xs text-neutral-400 mt-1">
                    Adds standard <code className="text-neutral-300">.eslintrc.json</code> with recommended Next.js / TypeScript rules.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#2d2d2d] bg-[#252526] flex items-center justify-between">
          <div className="text-xs text-neutral-400 flex items-center gap-2">
            {isLoading ? (
              <span className="flex items-center gap-2 text-amber-300 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{progressStage}</span>
              </span>
            ) : (
              <span>Target project: <strong className="text-neutral-200">{project.name}</strong></span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-[#333333] transition disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExecute}
              disabled={isLoading}
              className={`px-5 py-2 rounded-xl text-xs font-semibold text-white shadow-md transition flex items-center gap-2 disabled:opacity-50 ${
                activeTab === "tooling" && selectedTooling === "add-shadcn"
                  ? "bg-purple-600 hover:bg-purple-500"
                  : "bg-[var(--color-primary)] hover:opacity-90"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : activeTab === "tooling" ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Install Tooling</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Initialize Framework</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

