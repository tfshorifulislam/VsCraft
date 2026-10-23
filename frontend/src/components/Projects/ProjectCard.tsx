"use client";

import React, { useState, useEffect, useRef, type MouseEvent } from "react";
import Link from "next/link";
import {
  Star,
  MoreHorizontal,
  Copy,
  Edit2,
  Trash2,
  RotateCcw,
  Download,
  ExternalLink,
  Code2,
  Globe,
  Layers,
  Server,
  FilePlus2,
} from "lucide-react";
import { Project } from "@/types/editor";
import { Card } from "@/components/ui/card";

function formatFigmaDate(timestamp: number | string | Date): string {
  try {
    const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);

    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Recent";
  }
}

interface ProjectCardProps {
  project: Project;
  viewMode: "grid" | "list";
  isTrashView?: boolean;
  onStarToggle: (id: string, e: MouseEvent) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, currentName: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeletePermanent: (id: string) => void;
  onExport: (project: Project) => void;
}

export default function ProjectCard({
  project,
  viewMode,
  isTrashView = false,
  onStarToggle,
  onDuplicate,
  onRename,
  onTrash,
  onRestore,
  onDeletePermanent,
  onExport,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen]);

  const getTemplateDetails = () => {
    switch (project.template) {
      case "react-ts":
        return {
          label: "React + TS",
          icon: <Code2 className="w-3.5 h-3.5 text-cyan-500" />,
          accent: "#06b6d4",
          badgeBg: "bg-cyan-50 text-cyan-700 border-cyan-200",
        };
      case "vanilla-web":
        return {
          label: "Vanilla Web",
          icon: <Globe className="w-3.5 h-3.5 text-amber-500" />,
          accent: "#f59e0b",
          badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
        };
      case "next-app":
        return {
          label: "Next.js",
          icon: <Layers className="w-3.5 h-3.5 text-neutral-800" />,
          accent: "#171717",
          badgeBg: "bg-neutral-100 text-neutral-800 border-neutral-200",
        };
      case "node-api":
        return {
          label: "Node.js",
          icon: <Server className="w-3.5 h-3.5 text-emerald-500" />,
          accent: "#10b981",
          badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "blank":
      default:
        return {
          label: "Blank",
          icon: <FilePlus2 className="w-3.5 h-3.5 text-blue-500" />,
          accent: "#0d99ff",
          badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
        };
    }
  };

  const details = getTemplateDetails();

  // Find sample code for thumbnail
  const sampleFile =
    project.files.find((f) => !f.isFolder && (f.name.endsWith(".tsx") || f.name.endsWith(".html") || f.name.endsWith(".js") || f.name.endsWith(".ts"))) ||
    project.files[0];

  const lines = sampleFile?.content ? sampleFile.content.split("\n").slice(0, 6) : [];

  // Dropdown Menu Component
  const renderContextMenu = () => (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full mt-1 z-40 w-44 bg-white border border-[#e5e7eb] rounded-lg shadow-lg p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
    >
      {!isTrashView ? (
        <>
          <Link
            href={`/editor/${project.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[#f3f4f6] text-neutral-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Editor</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRename(project.id, project.name);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[#f3f4f6] text-neutral-700 text-left transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDuplicate(project.id);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[#f3f4f6] text-neutral-700 text-left transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onExport(project);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[#f3f4f6] text-neutral-700 text-left transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <div className="border-t border-[#f0f0f2] my-1" />
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onTrash(project.id);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-rose-50 text-rose-600 text-left transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Move to Trash</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRestore(project.id);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[#f3f4f6] text-neutral-700 text-left transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Project</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDeletePermanent(project.id);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-rose-50 text-rose-600 text-left font-semibold transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Forever</span>
          </button>
        </>
      )}
    </div>
  );

  // List View Rendering (Figma Table Row)
  if (viewMode === "list") {
    return (
      <div className="group relative bg-white border border-[#e5e7eb] hover:border-neutral-300 rounded-lg p-2.5 px-3 flex items-center justify-between gap-4 transition-all duration-150 hover:shadow-xs">
        {/* Left Info: Mini Thumbnail + Title */}
        <Link
          href={`/editor/${project.id}`}
          className="flex items-center gap-3 min-w-0 flex-1 focus-visible:outline-none"
        >
          {/* Mini Code Snapshot Preview */}
          <div className="w-10 h-8 rounded bg-[#161a23] border border-neutral-700/60 overflow-hidden shrink-0 flex flex-col justify-between p-1 select-none">
            <div className="w-full h-1 bg-neutral-700/80 rounded-xs" />
            <div className="space-y-0.5">
              <div className="w-3/4 h-0.5 bg-cyan-400/60 rounded-xs" />
              <div className="w-1/2 h-0.5 bg-neutral-500/60 rounded-xs" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs sm:text-sm text-neutral-900 group-hover:text-[#0d99ff] truncate transition-colors">
                {project.name}
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${details.badgeBg}`}>
                {details.label}
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
              <span>Edited {formatFigmaDate(project.updatedAt)}</span>
              <span>•</span>
              <span>{project.files.length} files</span>
            </div>
          </div>
        </Link>

        {/* Right Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!isTrashView && (
            <button
              type="button"
              onClick={(e) => onStarToggle(project.id, e)}
              title={project.starred ? "Unstar project" : "Star project"}
              className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-amber-500 transition cursor-pointer"
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  project.starred ? "text-amber-500 fill-amber-500" : ""
                }`}
              />
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              title="Project options"
              className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && renderContextMenu()}
          </div>
        </div>
      </div>
    );
  }

  // Grid View Rendering (Figma File Browser Card)
  return (
    <Card className="group relative flex flex-col bg-white rounded-xl border border-[#e5e7eb] hover:border-neutral-300 hover:shadow-md transition-all duration-150 overflow-hidden cursor-pointer p-0 gap-0">
      {/* Top Preview Canvas: 155px height */}
      <Link
        href={`/editor/${project.id}`}
        className="block h-[155px] bg-[#161a23] border-b border-[#e5e7eb] overflow-hidden relative focus-visible:outline-none"
      >
        {/* Mock Code Snapshot Content */}
        <div className="w-full h-full p-3 font-mono text-[9px] leading-relaxed select-none flex flex-col justify-between">
          {/* Mock Window Mini Header */}
          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-800 text-[8px] text-neutral-400">
            <div className="flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: details.accent }} />
              <span className="truncate">{sampleFile ? sampleFile.name : "App.tsx"}</span>
            </div>
            <span className="text-[8px] text-neutral-500 font-sans">{details.label}</span>
          </div>

          {/* Syntax Lines */}
          <div className="space-y-0.5 overflow-hidden opacity-85 py-1">
            {lines.length > 0 ? (
              lines.map((line, i) => (
                <div key={i} className="truncate">
                  <span className="text-neutral-600 mr-2 text-[8px]">{i + 1}</span>
                  <span
                    className={
                      line.includes("import") || line.includes("export") || line.includes("function")
                        ? "text-purple-400 font-medium"
                        : line.includes("<") || line.includes("/>")
                        ? "text-cyan-300"
                        : line.includes('"') || line.includes("'")
                        ? "text-emerald-300"
                        : "text-neutral-300"
                    }
                  >
                    {line.slice(0, 38) || "// clean workspace"}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-neutral-500 italic py-2">{"// Empty project workspace ready"}</div>
            )}
          </div>

          {/* Mini status bar */}
          <div className="pt-1 border-t border-neutral-800 text-[8px] flex items-center justify-between text-neutral-500">
            <span>{project.files.length} files</span>
            <span className="font-mono text-neutral-400">{sampleFile?.language || "code"}</span>
          </div>
        </div>

        {/* Figma-Style Hover Overlay with "Open in Editor" CTA */}
        <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center p-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-neutral-900 text-xs font-semibold shadow-md transform translate-y-1 group-hover:translate-y-0 transition-transform">
            <ExternalLink className="w-3.5 h-3.5 text-[#0d99ff]" />
            <span>Open in Editor</span>
          </span>
        </div>
      </Link>

      {/* Card Metadata Footer (Figma style) */}
      <div className="p-3 bg-white flex flex-col justify-between gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {/* Title with Framework Icon */}
          <Link
            href={`/editor/${project.id}`}
            className="flex items-center gap-1.5 min-w-0 flex-1 focus-visible:outline-none"
          >
            <div className="shrink-0">{details.icon}</div>
            <span className="font-medium text-xs text-neutral-900 group-hover:text-[#0d99ff] transition-colors truncate">
              {project.name}
            </span>
          </Link>

          {/* Right Icon Actions: Star & Context Menu */}
          <div className="flex items-center gap-0.5 shrink-0">
            {!isTrashView && (
              <button
                type="button"
                onClick={(e) => onStarToggle(project.id, e)}
                title={project.starred ? "Unstar project" : "Star project"}
                className={`p-1 rounded hover:bg-neutral-100 transition cursor-pointer ${
                  project.starred
                    ? "text-amber-500"
                    : "text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-amber-500"
                }`}
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    project.starred ? "fill-amber-500" : ""
                  }`}
                />
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                title="Project options"
                className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {menuOpen && renderContextMenu()}
            </div>
          </div>
        </div>

        {/* Sub-row: Metadata info */}
        <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
          <span>Edited {formatFigmaDate(project.updatedAt)}</span>
          <span className="text-[10px] text-neutral-400 font-mono">
            {project.files.length} {project.files.length === 1 ? "file" : "files"}
          </span>
        </div>
      </div>
    </Card>
  );
}
