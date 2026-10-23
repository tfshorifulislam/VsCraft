"use client";

import React from "react";
import {
  Search,
  LayoutGrid,
  List,
  Plus,
  Upload,
  X,
  FilePlus,
  Loader2,
  ChevronDown,
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
  projectCount?: number;
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
  projectCount = 0,
}: ProjectsHeaderProps) {
  const getCategoryTitle = () => {
    switch (category) {
      case "recent":
        return "Recents";
      case "starred":
        return "Starred";
      case "templates":
        return "Templates";
      case "trash":
        return "Trash";
      case "all":
      default:
        return "All Projects";
    }
  };

  return (
    <header className="border-b border-[#e5e7eb] bg-white sticky top-0 z-20 select-none">
      {/* Top Compact Navigation Bar */}
      <div className="h-12 px-6 flex items-center justify-between gap-4 border-b border-[#f0f0f2]">
        {/* Search Bar - Figma Style */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files and projects..."
            className="w-full bg-[#f3f4f6] hover:bg-[#eceef1] focus:bg-white border border-transparent focus:border-[#0d99ff] rounded-md pl-8 pr-12 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 font-mono border border-neutral-200/80 rounded px-1 py-0.2 bg-white/60">
              Ctrl K
            </span>
          )}
        </div>

        {/* Top-Right Quick Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenImportProject && (
            <button
              type="button"
              onClick={onOpenImportProject}
              className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-md border border-[#e5e7eb] hover:bg-[#f5f5f5] text-neutral-700 text-xs font-medium shadow-2xs transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-neutral-500" />
              <span>Import</span>
            </button>
          )}

          {onCreateEmptyProject && (
            <button
              type="button"
              onClick={onCreateEmptyProject}
              disabled={isCreatingEmpty}
              className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-md border border-[#e5e7eb] hover:bg-[#f5f5f5] text-neutral-700 text-xs font-medium shadow-2xs transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCreatingEmpty ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0d99ff]" />
              ) : (
                <FilePlus className="w-3.5 h-3.5 text-neutral-500" />
              )}
              <span>Empty Project</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenNewProject}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md bg-[#0d99ff] hover:bg-[#0b87e3] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Sub Toolbar: Page Title, Framework Filters, Sorting & View Toggle */}
      <div className="h-11 px-6 flex items-center justify-between gap-4">
        {/* Title & Item Count */}
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-neutral-900 tracking-tight">
            {getCategoryTitle()}
          </h1>
          {projectCount > 0 && (
            <span className="text-[11px] text-neutral-400 font-normal">
              {projectCount} {projectCount === 1 ? "project" : "projects"}
            </span>
          )}
        </div>

        {/* Filter, Sort and Grid/List Controls */}
        <div className="flex items-center gap-2">
          {/* Framework Filter */}
          <div className="relative flex items-center">
            <select
              value={filterType}
              onChange={(e) => onFilterChange(e.target.value)}
              className="appearance-none bg-transparent hover:bg-neutral-100 border border-[#e5e7eb] rounded-md pl-2 pr-6 py-1 text-xs text-neutral-700 outline-none cursor-pointer transition font-medium"
            >
              <option value="all">All frameworks</option>
              <option value="react-ts">React + TS</option>
              <option value="vanilla-web">Vanilla Web</option>
              <option value="next-app">Next.js</option>
              <option value="node-api">Node.js API</option>
              <option value="blank">Blank</option>
            </select>
            <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-2 pointer-events-none" />
          </div>

          {/* Sort Control */}
          <div className="relative flex items-center">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as "modified" | "name" | "created")}
              className="appearance-none bg-transparent hover:bg-neutral-100 border border-[#e5e7eb] rounded-md pl-2 pr-6 py-1 text-xs text-neutral-700 outline-none cursor-pointer transition font-medium"
            >
              <option value="modified">Recently modified</option>
              <option value="name">Alphabetical</option>
              <option value="created">Date created</option>
            </select>
            <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-2 pointer-events-none" />
          </div>

          <div className="h-4 w-px bg-neutral-200 mx-1" />

          {/* Grid / List View Toggle */}
          <div className="flex items-center bg-[#f3f4f6] p-0.5 rounded-md border border-[#e5e7eb]">
            <button
              type="button"
              onClick={() => onToggleViewMode("grid")}
              title="Grid view"
              className={`p-1 rounded transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-neutral-900 shadow-2xs font-semibold"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode("list")}
              title="List view"
              className={`p-1 rounded transition cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-neutral-900 shadow-2xs font-semibold"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
