"use client";

import React, { useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  Star,
  MoreVertical,
  Copy,
  Edit2,
  Trash2,
  RotateCcw,
  Download,
  ExternalLink,
  Code2,
} from "lucide-react";
import { Project } from "@/types/editor";

function formatProjectDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
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

  const getTemplateMeta = () => {
    switch (project.template) {
      case "react-ts":
        return {
          label: "React + TS",
          badgeBg: "bg-cyan-50 text-cyan-700 border-cyan-200",
          accentColor: "#06b6d4",
        };
      case "vanilla-web":
        return {
          label: "Vanilla Web",
          badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
          accentColor: "#f59e0b",
        };
      case "next-app":
        return {
          label: "Next.js",
          badgeBg: "bg-neutral-100 text-neutral-800 border-neutral-300",
          accentColor: "#171717",
        };
      case "node-api":
        return {
          label: "Node.js API",
          badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          accentColor: "#10b981",
        };
      case "python":
        return {
          label: "Python 3",
          badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
          accentColor: "#3b82f6",
        };
      case "cpp":
        return {
          label: "C++ 20",
          badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200",
          accentColor: "#6366f1",
        };
      case "go":
        return {
          label: "Go",
          badgeBg: "bg-sky-50 text-sky-700 border-sky-200",
          accentColor: "#0ea5e9",
        };
      case "rust":
        return {
          label: "Rust",
          badgeBg: "bg-orange-50 text-orange-700 border-orange-200",
          accentColor: "#f97316",
        };
      case "blank":
      default:
        return {
          label: "Blank",
          badgeBg: "bg-purple-50 text-purple-700 border-purple-200",
          accentColor: "#6c5ce7",
        };
    }
  };

  const meta = getTemplateMeta();

  // Realistic dynamic mini code snapshot thumbnail
  const renderThumbnailContent = () => {
    const sampleFile =
      project.files.find((f) => !f.isFolder && (f.name.endsWith(".tsx") || f.name.endsWith(".html") || f.name.endsWith(".js"))) ||
      project.files[0];

    const lines = sampleFile?.content ? sampleFile.content.split("\n").slice(0, 7) : [];

    return (
      <div className="w-full h-full p-3 font-mono text-[9px] leading-relaxed text-neutral-400 select-none overflow-hidden bg-[#161a24] flex flex-col justify-between group-hover:bg-[#131620] transition-colors">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#232938] text-[8px] text-neutral-500">
          <span className="truncate">{sampleFile ? sampleFile.name : "index.html"}</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.accentColor }} />
        </div>
        <div className="space-y-0.5 overflow-hidden opacity-85">
          {lines.map((line, i) => (
            <div key={i} className="truncate">
              <span className="text-neutral-600 mr-2">{i + 1}</span>
              <span className={line.includes("function") || line.includes("import") ? "text-purple-400 font-semibold" : line.includes("<") ? "text-cyan-300" : "text-neutral-300"}>
                {line.slice(0, 36) || "//"}
              </span>
            </div>
          ))}
        </div>
        <div className="pt-1 border-t border-[#232938] text-[8px] flex items-center justify-between text-neutral-500">
          <span>{project.files.length} files</span>
          <span className="font-sans font-semibold text-neutral-400">{meta.label}</span>
        </div>
      </div>
    );
  };

  if (viewMode === "list") {
    return (
      <div className="relative group bg-white border border-[#eaeaea] hover:border-[var(--color-primary)]/40 rounded-xl p-3 flex items-center justify-between gap-4 transition shadow-xs hover:shadow-sm">
        {/* Left Info */}
        <Link
          href={`/editor/${project.id}`}
          className="flex items-center gap-3.5 min-w-0 flex-1 focus-visible:outline-none"
        >
          <div className="w-9 h-9 rounded-lg bg-[#181d29] flex items-center justify-center text-white shrink-0 shadow-xs">
            <Code2 className="w-4 h-4 stroke-[2]" style={{ color: meta.accentColor }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs sm:text-sm text-[#171717] group-hover:text-[var(--color-primary)] truncate transition-colors">
                {project.name}
              </span>
              <span className={`text-[10px] px-2 py-0.2 rounded-full font-medium border ${meta.badgeBg}`}>
                {meta.label}
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
              <span>Updated {formatProjectDate(project.updatedAt)}</span>
              <span>•</span>
              <span>{project.files.length} files</span>
            </div>
          </div>
        </Link>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isTrashView && (
            <button
              type="button"
              onClick={(e) => onStarToggle(project.id, e)}
              title={project.starred ? "Unstar project" : "Star project"}
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-amber-500 transition cursor-pointer"
            >
              <Star
                className={`w-4 h-4 ${
                  project.starred ? "text-amber-500 fill-amber-500" : ""
                }`}
              />
            </button>
          )}

          {/* Context Menu Button */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              title="Project actions"
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-8 z-30 w-44 bg-white border border-[#eaeaea] rounded-xl shadow-lg p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
              >
                {!isTrashView ? (
                  <>
                    <Link
                      href={`/editor/${project.id}`}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Workspace</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onRename(project.id, project.name);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>
                    <div className="border-t border-[#f0f0f0] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onTrash(project.id);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 text-left font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Forever</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Grid Mode Card
  return (
    <div className="relative group bg-white border border-[#eaeaea] hover:border-[var(--color-primary)]/40 rounded-2xl overflow-hidden transition-all duration-200 shadow-xs hover:shadow-md flex flex-col justify-between">
      {/* Top Preview Canvas */}
      <Link
        href={`/editor/${project.id}`}
        className="block h-36 border-b border-[#eaeaea] overflow-hidden focus-visible:outline-none relative"
      >
        {renderThumbnailContent()}
      </Link>

      {/* Card Body */}
      <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/editor/${project.id}`}
            className="font-semibold text-xs sm:text-sm text-[#171717] group-hover:text-[var(--color-primary)] transition-colors truncate flex-1 focus-visible:outline-none"
          >
            {project.name}
          </Link>

          {!isTrashView && (
            <button
              type="button"
              onClick={(e) => onStarToggle(project.id, e)}
              title={project.starred ? "Unstar project" : "Star project"}
              className="p-1 rounded-md text-neutral-400 hover:text-amber-500 transition cursor-pointer shrink-0"
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  project.starred ? "text-amber-500 fill-amber-500" : ""
                }`}
              />
            </button>
          )}
        </div>

        {/* Footer Meta Row */}
        <div className="flex items-center justify-between pt-1 border-t border-[#f5f5f5] text-[11px] text-neutral-400">
          <span className={`text-[10px] px-2 py-0.2 rounded-full font-medium border ${meta.badgeBg}`}>
            {meta.label}
          </span>
          <span>{formatProjectDate(project.updatedAt)}</span>

          {/* Context Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              title="Project options"
              className="p-1 hover:text-neutral-700 rounded transition cursor-pointer"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 bottom-6 z-30 w-44 bg-white border border-[#eaeaea] rounded-xl shadow-lg p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
              >
                {!isTrashView ? (
                  <>
                    <Link
                      href={`/editor/${project.id}`}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>
                    <div className="border-t border-[#f0f0f0] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onTrash(project.id);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 text-neutral-700 text-left"
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
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 text-left font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Forever</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
