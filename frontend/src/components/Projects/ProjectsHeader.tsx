"use client";

import React from "react";
import {
  Search,
  LayoutGrid,
  List,
  Plus,
  Upload,
  SlidersHorizontal,
  X,
  FilePlus,
  Loader2,
} from "lucide-react";
import { DashboardViewCategory } from "./ProjectsSidebar";

interface ProjectsHeaderProps {
  category: DashboardViewCategory;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: "grid" | "list";
  onToggleViewMode: (mode: "grid" | "list") => void;
  filterType: string;
  onFilterChange: (type: string) => void;
  sortBy: "modified" | "name" | "created";
  onSortChange: (sort: "modified" | "name" | "created") => void;
  onOpenNewProject: () => void;
  onCreateEmptyProject?: () => void;
  isCreatingEmpty?: boolean;
  onOpenImportProject?: () => void;
}

export default function ProjectsHeader({
  category,
  searchQuery,
  onSearchChange,
  viewMode,
  onToggleViewMode,
  filterType,
  onFilterChange,
  sortBy,
  onSortChange,
  onOpenNewProject,
  onCreateEmptyProject,
  isCreatingEmpty = false,
  onOpenImportProject,
}: ProjectsHeaderProps) {
  const getCategoryTitle = () => {
    switch (category) {
      case "recent":
        return "Recent Projects";
      case "starred":
        return "Starred Projects";
      case "templates":
        return "Project Templates";
      case "trash":
        return "Trash Bin";
      case "all":
      default:
        return "All Projects";
    }
  };

  const getCategorySubtitle = () => {
    switch (category) {
      case "recent":
        return "Jump back into projects you've recently worked on.";
      case "starred":
        return "Pinned favorite projects for instant access.";
      case "templates":
        return "Pre-configured templates to kickstart your next application.";
      case "trash":
        return "Deleted projects can be restored or permanently removed.";
      case "all":
      default:
        return "Manage, explore, and launch your browser-based coding workspaces.";
    }
  };

  return (
    <div className="p-6 sm:p-8 border-b border-[#eaeaea] bg-white space-y-5">
      {/* Top Title & CTA Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171717]">
            {getCategoryTitle()}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            {getCategorySubtitle()}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0 flex-wrap">
          {onOpenImportProject && (
            <button
              type="button"
              onClick={onOpenImportProject}
              className="inline-flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl border border-[#eaeaea] hover:bg-neutral-50 text-neutral-700 text-xs sm:text-sm font-semibold shadow-2xs transition cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Import Project</span>
            </button>
          )}
          {onCreateEmptyProject && (
            <button
              type="button"
              onClick={onCreateEmptyProject}
              disabled={isCreatingEmpty}
              className="inline-flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl border border-[#d1d1d6] hover:border-[var(--color-primary)] bg-white hover:bg-neutral-50 text-neutral-800 hover:text-[var(--color-primary)] text-xs sm:text-sm font-semibold shadow-2xs transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCreatingEmpty ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
              ) : (
                <FilePlus className="w-4 h-4 text-[var(--color-primary)]" />
              )}
              <span>Empty Project</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenNewProject}
            className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs sm:text-sm font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Controls Row: Search + Filters + Sort + View Mode */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search projects by name..."
            className="w-full bg-[#f9f9fb] border border-[#e5e5e7] hover:border-[#d1d1d6] focus:border-[var(--color-primary)] rounded-xl pl-9 pr-8 py-2 text-xs text-[#171717] outline-none transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters & Sorting Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Framework Filter */}
          <div className="flex items-center gap-1.5 bg-[#f9f9fb] border border-[#e5e5e7] rounded-lg px-2.5 py-1.5 text-xs text-neutral-700">
            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <select
              value={filterType}
              onChange={(e) => onFilterChange(e.target.value)}
              className="bg-transparent outline-none cursor-pointer text-xs"
            >
              <option value="all">All Types</option>
              <option value="react-ts">React + TS</option>
              <option value="vanilla-web">Vanilla Web</option>
              <option value="next-app">Next.js</option>
              <option value="node-api">Node.js API</option>
              <option value="blank">Blank</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 bg-[#f9f9fb] border border-[#e5e5e7] rounded-lg px-2.5 py-1.5 text-xs text-neutral-700">
            <span className="text-neutral-400 text-[11px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as "modified" | "name" | "created")}
              className="bg-transparent outline-none cursor-pointer text-xs font-medium"
            >
              <option value="modified">Recently Modified</option>
              <option value="name">Name (A-Z)</option>
              <option value="created">Created Date</option>
            </select>
          </div>

          {/* Grid / List Mode */}
          <div className="flex items-center bg-[#f9f9fb] border border-[#e5e5e7] p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => onToggleViewMode("grid")}
              title="Grid view"
              className={`p-1.5 rounded transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-[var(--color-primary)] shadow-xs"
                  : "text-neutral-400 hover:text-neutral-700"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode("list")}
              title="List view"
              className={`p-1.5 rounded transition cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-[var(--color-primary)] shadow-xs"
                  : "text-neutral-400 hover:text-neutral-700"
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

