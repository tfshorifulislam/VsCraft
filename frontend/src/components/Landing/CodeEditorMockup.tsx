"use client";

import React, { useState, type MouseEvent } from "react";
import {
  FileCode,
  Play,
  Sparkles,
  Terminal as TerminalIcon,
  Globe,
  Check,
  RotateCw,
  GitBranch,
  Search,
  CheckCircle2,
  Send,
} from "lucide-react";

type FileKey = "Hero.tsx" | "page.tsx" | "globals.css";

interface FileContent {
  path: string;
  language: string;
  code: string;
}

const fileDatabase: Record<FileKey, FileContent> = {
  "Hero.tsx": {
    path: "src/components/Hero.tsx",
    language: "typescript",
    code: `import React, { useState, type MouseEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

export default function HeroSection() {
  const [active, setActive] = useState(true);

  return (
    <section className="relative px-6 py-12 text-center">
      {/* AI Workspace announcement pill */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200">
        <Sparkles className="w-3.5 h-3.5" />
        <span>AI Workspace Active</span>
      </div>

      <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">
        Your ideas deserve better code.
      </h1>

      <p className="mt-3 text-sm sm:text-base text-neutral-600 max-w-lg mx-auto">
        Write, build, and ship projects faster with an AI assistant.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium shadow-sm transition">
          Start Coding Free
        </button>
      </div>
    </section>
  );
}`,
  },
  "page.tsx": {
    path: "src/app/page.tsx",
    language: "typescript",
    code: `import React from "react";
import HeroSection from "@/components/Hero";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <HeroSection />
    </main>
  );
}`,
  },
  "globals.css": {
    path: "src/app/globals.css",
    language: "css",
    code: `@import "tailwindcss";

:root {
  --color-background: #FFFFFF;
  --color-foreground: #171717;
  --color-primary: #6C5CE7;
  --color-accent-soft: #F3F0FF;
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
}`,
  },
};

interface CodeEditorMockupProps {
  embeddedInHero?: boolean;
}

export default function CodeEditorMockup({
  embeddedInHero = false,
}: CodeEditorMockupProps) {
  // If rendered standalone from page.tsx (without embeddedInHero flag),
  // return null to prevent duplicate mockups now that it's part of the split hero.
  if (!embeddedInHero) {
    return null;
  }

  return <EditorVisual />;
}

function EditorVisual() {

  const [activeFile, setActiveFile] = useState<FileKey>("Hero.tsx");
  const [openFiles, setOpenFiles] = useState<FileKey[]>([
    "Hero.tsx",
    "page.tsx",
    "globals.css",
  ]);
  const [activeBottomTab, setActiveBottomTab] = useState<
    "terminal" | "preview" | "problems"
  >("terminal");
  const [mobileViewTab, setMobileViewTab] = useState<
    "editor" | "ai" | "preview" | "terminal"
  >("editor");
  const [appliedDiff, setAppliedDiff] = useState(false);

  const selectFile = (file: FileKey) => {
    if (!openFiles.includes(file)) {
      setOpenFiles([...openFiles, file]);
    }
    setActiveFile(file);
    if (mobileViewTab !== "editor") {
      setMobileViewTab("editor");
    }
  };

  const closeTab = (file: FileKey, e: MouseEvent) => {
    e.stopPropagation();
    if (openFiles.length === 1) return;
    const nextTabs = openFiles.filter((f) => f !== file);
    setOpenFiles(nextTabs);
    if (activeFile === file) {
      setActiveFile(nextTabs[nextTabs.length - 1]);
    }
  };

  return (
    <div id="editor-demo" className="relative w-full select-none">
      {/* Subtle purple ambient glow behind the mockup */}
      <div
        className="pointer-events-none absolute -inset-3 sm:-inset-5 bg-gradient-to-tr from-[var(--color-primary)]/25 via-[var(--color-accent-soft)]/40 to-transparent blur-2xl rounded-3xl opacity-75 -z-10"
        aria-hidden="true"
      />

      {/* Floating Badge 1: AI Assistant (Top Right) */}
      <div className="absolute -top-3.5 right-3 sm:-right-2 z-20 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#161B26]/90 backdrop-blur-md border border-[var(--color-primary)]/40 text-white text-xs font-medium shadow-xl shadow-[var(--color-primary)]/15 animate-in fade-in zoom-in-95 duration-300">
          <Sparkles className="w-3.5 h-3.5 text-[#A78BFA] fill-[#A78BFA]/20" />
          <span className="font-semibold text-white tracking-tight">AI Assistant</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline">Active</span>
        </div>
      </div>

      {/* Floating Badge 2: Live Preview (Bottom Left) */}
      <div className="absolute -bottom-3.5 left-3 sm:-left-2 z-20 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#161B26]/90 backdrop-blur-md border border-emerald-500/40 text-white text-xs font-medium shadow-xl shadow-black/25 animate-in fade-in zoom-in-95 duration-300">
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-white tracking-tight">Live Preview</span>
          <span className="text-[10px] text-emerald-300 font-mono bg-emerald-950/80 border border-emerald-800/40 px-1.5 py-0.5 rounded-full">
            :3000
          </span>
        </div>
      </div>

      {/* Main IDE Outer Container with Mac Window Frame */}
      <div className="relative rounded-2xl border border-[#232B3D] bg-[#0E131F] shadow-2xl overflow-hidden transition-all text-[var(--color-code-foreground)] font-sans ring-1 ring-black/20">
        {/* Top Window Header */}
        <div className="h-10 bg-[#161B26] border-b border-[#222938] px-3 sm:px-4 flex items-center justify-between select-none">
          {/* macOS traffic light window controls */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/50 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/50 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/50 inline-block" />
            <div className="hidden sm:flex items-center gap-1.5 ml-2.5 text-xs text-neutral-400 font-medium">
              <GitBranch className="w-3 h-3 text-neutral-400" />
              <span>main*</span>
            </div>
          </div>

          {/* Center Project Path Pill */}
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-1.5 bg-[#0E131F] hover:bg-[#1C2230] border border-[#262D3D] px-2.5 py-0.5 rounded-[var(--radius-md)] text-[11px] text-neutral-300 transition-colors">
              <Search className="w-3 h-3 text-neutral-400" />
              <span className="hidden sm:inline font-mono text-neutral-400">my-project/</span>
              <span className="text-neutral-200 font-medium font-mono">
                {fileDatabase[activeFile].path}
              </span>
              <kbd className="hidden md:inline-block ml-1.5 px-1 py-0.2 text-[9px] bg-[#161B26] border border-[#2E364A] rounded text-neutral-400">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Right Toolbar Status & Run Button */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
              <span>Ready</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveBottomTab("preview");
                if (mobileViewTab !== "preview") setMobileViewTab("preview");
              }}
              title="Run in Live Preview"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-[var(--radius-sm)] transition shadow-xs active:scale-95 cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">Run</span>
            </button>
          </div>
        </div>

        {/* Mobile View Switcher Tabs - Streamlines small screens cleanly */}
        <div className="flex md:hidden bg-[#131823] border-b border-[#222938] p-1 gap-1">
          <button
            type="button"
            onClick={() => setMobileViewTab("editor")}
            className={`flex-1 py-1 text-[11px] font-medium rounded-[var(--radius-sm)] text-center transition cursor-pointer ${
              mobileViewTab === "editor"
                ? "bg-[var(--color-primary)] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setMobileViewTab("ai")}
            className={`flex-1 py-1 text-[11px] font-medium rounded-[var(--radius-sm)] text-center transition flex items-center justify-center gap-1 cursor-pointer ${
              mobileViewTab === "ai"
                ? "bg-[var(--color-primary)] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>AI Agent</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileViewTab("preview")}
            className={`flex-1 py-1 text-[11px] font-medium rounded-[var(--radius-sm)] text-center transition flex items-center justify-center gap-1 cursor-pointer ${
              mobileViewTab === "preview"
                ? "bg-[var(--color-primary)] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Globe className="w-3 h-3 text-sky-400" />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileViewTab("terminal")}
            className={`flex-1 py-1 text-[11px] font-medium rounded-[var(--radius-sm)] text-center transition flex items-center justify-center gap-1 cursor-pointer ${
              mobileViewTab === "terminal"
                ? "bg-[var(--color-primary)] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <TerminalIcon className="w-3 h-3" />
            <span>Term</span>
          </button>
        </div>

        {/* Split IDE Main Workspace (Editor + AI Chat) */}
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[360px] sm:min-h-[420px] lg:min-h-[440px]">
          {/* Sub-Panel 1: Code Editor (Tabs + Line numbers + Syntax code) */}
          <div
            className={`md:col-span-7 bg-[#0E131F] flex flex-col justify-between overflow-hidden border-r border-[#202737] ${
              mobileViewTab !== "editor" ? "hidden md:flex" : "flex"
            }`}
          >
            {/* File Tab Bar */}
            <div className="bg-[#141A26] border-b border-[#222938] flex items-center overflow-x-auto select-none no-scrollbar">
              {openFiles.map((f) => (
                <div
                  key={f}
                  onClick={() => selectFile(f)}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border-r border-[#222938] cursor-pointer transition ${
                    activeFile === f
                      ? "bg-[#0E131F] text-white border-t-2 border-t-[var(--color-primary)] font-medium"
                      : "text-neutral-400 hover:bg-[#1B2232] hover:text-neutral-200"
                  }`}
                >
                  <FileCode
                    className={`w-3.5 h-3.5 ${
                      f.endsWith(".tsx")
                        ? "text-cyan-400"
                        : f.endsWith(".css")
                        ? "text-blue-400"
                        : "text-amber-400"
                    }`}
                  />
                  <span>{f}</span>
                  <button
                    type="button"
                    onClick={(e) => closeTab(f, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-400 ml-1 text-neutral-400 transition"
                    aria-label={`Close ${f}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Breadcrumb Strip */}
            <div className="px-3 py-1 bg-[#0E131F] text-[10px] font-mono text-neutral-400 border-b border-[#1A2230] flex items-center gap-1.5">
              <span>my-project</span>
              <span>›</span>
              <span className="text-neutral-400">src</span>
              <span>›</span>
              <span className="text-neutral-300">{fileDatabase[activeFile].path}</span>
            </div>

            {/* Code Viewing Area */}
            <div className="flex-1 overflow-x-auto p-3.5 font-mono text-xs leading-relaxed flex">
              {/* Line numbers */}
              <div
                className="pr-3 mr-2 text-right text-[var(--color-syntax-line-number)] select-none border-r border-[#1F2738] flex flex-col opacity-60"
                aria-hidden="true"
              >
                {fileDatabase[activeFile].code
                  .split("\n")
                  .map((_, i) => (
                    <span key={i} className="leading-relaxed text-[11px]">
                      {i + 1}
                    </span>
                  ))}
              </div>

              {/* Syntax Highlighted Code */}
              <pre className="text-[var(--color-code-foreground)] font-mono overflow-x-auto whitespace-pre text-[11px] sm:text-xs">
                <code>
                  {activeFile === "Hero.tsx" ? (
                    <>
                      <span className="text-[var(--color-syntax-keyword)]">import</span>{" "}
                      <span className="text-neutral-300">React, &#123; useState &#125;</span>{" "}
                      <span className="text-[var(--color-syntax-keyword)]">from</span>{" "}
                      <span className="text-[var(--color-syntax-string)]">&quot;react&quot;</span>;{"\n"}
                      <span className="text-[var(--color-syntax-keyword)]">import</span>{" "}
                      <span className="text-neutral-300">&#123; ArrowRight, Sparkles &#125;</span>{" "}
                      <span className="text-[var(--color-syntax-keyword)]">from</span>{" "}
                      <span className="text-[var(--color-syntax-string)]">&quot;lucide-react&quot;</span>;{"\n\n"}
                      <span className="text-[var(--color-syntax-function)]">export default function</span>{" "}
                      <span className="text-[var(--color-syntax-component)] font-semibold">HeroSection</span>() &#123;{"\n"}
                      {"  "}
                      <span className="text-[var(--color-syntax-function)]">const</span> [active, setActive] ={" "}
                      <span className="text-[var(--color-syntax-component)]">useState</span>(
                      <span className="text-[var(--color-syntax-number)]">true</span>);{"\n\n"}
                      {"  "}
                      <span className="text-[var(--color-syntax-function)]">return</span> ({"\n"}
                      {"    "}&lt;
                      <span className="text-[var(--color-syntax-component)]">section</span>{" "}
                      <span className="text-[var(--color-syntax-prop)]">className</span>=
                      <span className="text-[var(--color-syntax-string)]">&quot;relative px-6 py-12 text-center&quot;</span>&gt;{"\n"}
                      <span className="text-[var(--color-syntax-comment)]">
                        {"      "}&#123;/* AI Workspace announcement pill */&#125;
                      </span>
                      {"\n"}
                      <span
                        className={
                          appliedDiff
                            ? "bg-emerald-950/70 text-emerald-300 block -mx-2 px-2 py-0.5 rounded-[var(--radius-sm)] border-l-2 border-[var(--color-success)] transition-all"
                            : ""
                        }
                      >
                        {"      "}&lt;
                        <span className="text-[var(--color-syntax-component)]">div</span>{" "}
                        <span className="text-[var(--color-syntax-prop)]">className</span>=
                        <span className="text-[var(--color-syntax-string)]">
                          &quot;inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200&quot;
                        </span>
                        &gt;{"\n"}
                        {"        "}&lt;
                        <span className="text-[var(--color-syntax-component)]">Sparkles</span>{" "}
                        <span className="text-[var(--color-syntax-prop)]">className</span>=
                        <span className="text-[var(--color-syntax-string)]">&quot;w-3.5 h-3.5&quot;</span> /&gt;{"\n"}
                        {"        "}&lt;<span className="text-[var(--color-syntax-component)]">span</span>&gt;AI Workspace Active&lt;/
                        <span className="text-[var(--color-syntax-component)]">span</span>&gt;{"\n"}
                        {"      "}&lt;/<span className="text-[var(--color-syntax-component)]">div</span>&gt;
                      </span>
                      {"\n\n"}
                      {"      "}&lt;
                      <span className="text-[var(--color-syntax-component)]">h1</span>{" "}
                      <span className="text-[var(--color-syntax-prop)]">className</span>=
                      <span className="text-[var(--color-syntax-string)]">&quot;mt-4 text-3xl font-extrabold&quot;</span>&gt;{"\n"}
                      {"        "}Your ideas deserve better code.{"\n"}
                      {"      "}&lt;/<span className="text-[var(--color-syntax-component)]">h1</span>&gt;{"\n\n"}
                      <span
                        className={
                          appliedDiff
                            ? "bg-emerald-950/70 text-emerald-300 block -mx-2 px-2 py-0.5 rounded-[var(--radius-sm)] border-l-2 border-[var(--color-success)] transition-all"
                            : ""
                        }
                      >
                        {"      "}&lt;
                        <span className="text-[var(--color-syntax-component)]">button</span>{" "}
                        <span className="text-[var(--color-syntax-prop)]">className</span>=
                        <span className="text-[var(--color-syntax-string)]">&quot;px-5 py-2.5 bg-violet-600 ...&quot;</span>&gt;{"\n"}
                        {"        "}Start Coding Free{"\n"}
                        {"      "}&lt;/<span className="text-[var(--color-syntax-component)]">button</span>&gt;
                      </span>
                      {"\n"}
                      {"    "}&lt;/<span className="text-[var(--color-syntax-component)]">section</span>&gt;{"\n"}
                      {"  "});{"\n"}
                      &#125;
                    </>
                  ) : (
                    fileDatabase[activeFile].code
                  )}
                </code>
              </pre>
            </div>
          </div>

          {/* Sub-Panel 2: AI Assistant Chat Panel */}
          <div
            className={`md:col-span-5 bg-[#121724] flex flex-col justify-between ${
              mobileViewTab !== "ai" ? "hidden md:flex" : "flex"
            }`}
          >
            {/* AI Assistant Header */}
            <div className="px-3 py-2 bg-[#171E2E] border-b border-[#222B3D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] flex items-center justify-center text-white">
                  <Sparkles className="w-3 h-3" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>AI Assistant</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                  </div>
                </div>
              </div>
              <span className="text-[10px] bg-[#222B3D] text-neutral-300 px-2 py-0.5 rounded-[var(--radius-sm)] font-mono">
                Claude 3.5 Sonnet
              </span>
            </div>

            {/* AI Chat Thread */}
            <div className="p-3 space-y-3 flex-1 overflow-y-auto text-xs">
              {/* User Prompt */}
              <div className="flex flex-col items-end">
                <div className="max-w-[92%] bg-[var(--color-primary)] text-white p-2.5 rounded-xl rounded-tr-xs shadow-xs text-[11px] leading-relaxed">
                  Add an animated badge and responsive CTA to this Hero component.
                </div>
                <span className="text-[9px] text-neutral-400 mt-1 mr-1">You • just now</span>
              </div>

              {/* AI Response Card */}
              <div className="w-full bg-[#1A2234] border border-[#27344D] rounded-[var(--radius-lg)] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-neutral-200 font-medium text-[11px]">
                    <Sparkles className="w-3 h-3 text-[#A78BFA]" />
                    <span>Proposed Changes</span>
                  </div>
                  <span className="text-[9px] text-[var(--color-success)] bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.2 rounded font-mono">
                    +8 lines / -2 lines
                  </span>
                </div>

                <p className="text-neutral-300 text-[10px] leading-relaxed">
                  Added the announcement pill with a sparkle icon and styled the primary CTA button.
                </p>

                {/* Diff Box */}
                <div className="rounded-[var(--radius-sm)] bg-[#0E131F] border border-[#232D40] p-1.5 font-mono text-[10px] overflow-x-auto space-y-0.5">
                  <div className="text-[var(--color-success)] bg-emerald-950/40 px-1 py-0.2 rounded-[var(--radius-sm)]">
                    + &lt;div className=&quot;inline-flex ...&quot;&gt;
                  </div>
                  <div className="text-[var(--color-success)] bg-emerald-950/40 px-1 py-0.2 rounded-[var(--radius-sm)]">
                    + &lt;Sparkles className=&quot;w-3.5 h-3.5&quot; /&gt;
                  </div>
                  <div className="text-[var(--color-success)] bg-emerald-950/40 px-1 py-0.2 rounded-[var(--radius-sm)]">
                    + &lt;button className=&quot;bg-violet-600 ...&quot;&gt;
                  </div>
                </div>

                {/* Diff Interactive Action */}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setAppliedDiff(!appliedDiff)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-[var(--radius-sm)] text-[11px] font-medium transition cursor-pointer ${
                      appliedDiff
                        ? "bg-[var(--color-success)] text-white"
                        : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-xs"
                    }`}
                  >
                    <Check className="w-3 h-3" />
                    <span>{appliedDiff ? "Diff Applied ✓" : "Apply Diff"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppliedDiff(false)}
                    className="px-2 py-1 rounded-[var(--radius-sm)] text-[11px] font-medium bg-[#222C3E] hover:bg-[#2A364B] text-neutral-300 transition cursor-pointer"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>

            {/* Chat Input */}
            <div className="p-2.5 bg-[#171E2E] border-t border-[#222B3D]">
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value="Ask AI to refactor, fix bugs..."
                  className="w-full bg-[#0E131F] border border-[#283348] rounded-[var(--radius-md)] pl-2.5 pr-8 py-1.5 text-[11px] text-neutral-400 cursor-not-allowed focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Send message"
                  className="absolute right-1 top-1 p-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-hover)] transition cursor-pointer"
                >
                  <Send className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Dedicated Preview Tab */}
          {mobileViewTab === "preview" && (
            <div className="md:hidden col-span-1 p-4 bg-[var(--color-surface)] text-[var(--color-foreground)]">
              <div className="border border-[var(--color-border)] rounded-xl p-5 text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <Sparkles className="w-3 h-3" />
                  <span>AI Workspace Active</span>
                </div>
                <h3 className="text-lg font-bold text-[var(--color-foreground)]">
                  Your ideas deserve better code.
                </h3>
                <p className="text-xs landing-muted">
                  Write, build, and ship projects with an intelligent AI coding assistant.
                </p>
                <button className="px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-medium rounded-lg">
                  Start Coding Free
                </button>
              </div>
            </div>
          )}

          {/* Mobile Dedicated Terminal Tab */}
          {mobileViewTab === "terminal" && (
            <div className="md:hidden col-span-1 p-3.5 bg-[#0E131F] text-xs font-mono text-neutral-300 space-y-1">
              <div className="text-[var(--color-success)]">~/my-project $ npm run dev</div>
              <div className="text-neutral-400">▲ Next.js 16.4.2 (Turbopack)</div>
              <div className="text-[var(--color-success)]">✓ Ready in 520ms</div>
              <div className="text-neutral-300">○ Local: http://localhost:3000</div>
            </div>
          )}
        </div>

        {/* Integrated Bottom Drawer: Terminal & Live Preview */}
        <div className="border-t border-[#202737] bg-[#101420]">
          {/* Bottom Tabs Bar */}
          <div className="flex items-center justify-between px-3 bg-[#141A26] border-b border-[#202737] text-[11px]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveBottomTab("terminal")}
                className={`flex items-center gap-1 py-1.5 px-2.5 border-b-2 font-mono transition cursor-pointer ${
                  activeBottomTab === "terminal"
                    ? "border-[var(--color-primary)] text-white font-medium"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <TerminalIcon className="w-3 h-3" />
                <span>Terminal</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab("preview")}
                className={`flex items-center gap-1.5 py-1.5 px-2.5 border-b-2 font-mono transition cursor-pointer ${
                  activeBottomTab === "preview"
                    ? "border-[var(--color-primary)] text-white font-medium"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Globe className="w-3 h-3 text-sky-400" />
                <span>Live Preview</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab("problems")}
                className={`hidden sm:flex items-center gap-1 py-1.5 px-2.5 border-b-2 font-mono transition cursor-pointer ${
                  activeBottomTab === "problems"
                    ? "border-[var(--color-primary)] text-white font-medium"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <span>Problems (0)</span>
              </button>
            </div>
            <div className="text-[10px] text-neutral-400 font-mono hidden sm:block">
              turbopack • node v20
            </div>
          </div>

          {/* Bottom Panel Body */}
          <div className="p-2.5 font-mono text-[11px] min-h-[70px] max-h-[110px] overflow-y-auto">
            {activeBottomTab === "terminal" && (
              <div className="space-y-0.5 text-neutral-300">
                <div className="flex items-center gap-1.5 text-neutral-400">
                  <span className="text-[var(--color-success)] font-semibold">~/my-project</span>
                  <span>$</span>
                  <span className="text-white">npm run dev</span>
                </div>
                <div className="text-neutral-400">▲ Next.js 16.4.2 (Turbopack)</div>
                <div className="text-[var(--color-success)]">✓ Ready in 520ms</div>
                <div className="text-neutral-300">
                  ○ Local:{" "}
                  <span
                    onClick={() => setActiveBottomTab("preview")}
                    className="text-sky-400 underline cursor-pointer"
                  >
                    http://localhost:3000
                  </span>
                </div>
              </div>
            )}

            {activeBottomTab === "preview" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between bg-[#192030] px-2.5 py-1 rounded-[var(--radius-sm)] border border-[#273248] text-[10px]">
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <RotateCw className="w-2.5 h-2.5 text-neutral-400 hover:text-white cursor-pointer" />
                    <span className="text-neutral-400">http://localhost:3000</span>
                  </div>
                  <span className="text-[9px] bg-[var(--color-success)]/20 text-[var(--color-success)] px-1 py-0.2 rounded">
                    Live 3000
                  </span>
                </div>
                {/* Mini Rendered Website Preview */}
                <div className="p-3 bg-[var(--color-surface)] text-[var(--color-foreground)] rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-inner text-center">
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>AI Workspace Active</span>
                  </div>
                  <h4 className="mt-1 text-xs font-bold text-[var(--color-foreground)]">
                    Your ideas deserve better code.
                  </h4>
                  <div className="mt-1.5">
                    <span className="inline-block px-2.5 py-0.5 text-[10px] font-medium bg-[var(--color-primary)] text-white rounded shadow-xs">
                      Start Coding Free
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeBottomTab === "problems" && (
              <div className="text-neutral-400 text-[11px] py-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
                <span>No syntax or type errors found in workspace.</span>
              </div>
            )}
          </div>
        </div>

        {/* IDE Status Bar */}
        <div className="h-6 bg-[#161B26] border-t border-[#222938] px-3 flex items-center justify-between text-[10px] text-neutral-400 select-none font-mono">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-neutral-300">
              <GitBranch className="w-3 h-3 text-[var(--color-primary)]" />
              <span>main</span>
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">0 Errors</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Ln 14, Col 28</span>
            <span className="text-sky-400 font-semibold">TypeScript React</span>
            <span className="text-[var(--color-success)] hidden sm:inline">Prettier: ✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
