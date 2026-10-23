"use client";

import React from "react";
import { FolderCode, Star, Trash2, Search, Plus, FilePlus, Loader2 } from "lucide-react";
import { DashboardViewCategory } from "./ProjectsSidebar";

interface ProjectEmptyStateProps {
  category: DashboardViewCategory;
  isSearchActive: boolean;
  onOpenNewProject: () => void;
  onCreateEmptyProject?: () => void;
  isCreatingEmpty?: boolean;
  onClearSearch?: () => void;
}

export default function ProjectEmptyState({
  category,
  isSearchActive,
  onOpenNewProject,
  onCreateEmptyProject,
  isCreatingEmpty = false,
  onClearSearch,
}: ProjectEmptyStateProps) {
  if (isSearchActive) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center select-none bg-white rounded-xl border border-dashed border-[#e5e7eb]">
        <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500 mb-3">
          <Search className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-semibold text-neutral-900">No matching projects</h3>
        <p className="text-xs text-neutral-500 max-w-xs mt-1">
          No files or projects match your search query. Try another term or clear the filter.
        </p>
        {onClearSearch && (
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-4 px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-neutral-50 text-xs font-medium text-neutral-700 transition cursor-pointer"
          >
            Clear Search
          </button>
        )}
      </div>
    );
  }

  if (category === "starred") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center select-none bg-white rounded-xl border border-dashed border-[#e5e7eb]">
        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center mb-3">
          <Star className="w-5 h-5 fill-amber-500/20" />
        </div>
        <h3 className="text-sm font-semibold text-neutral-900">No starred projects</h3>
        <p className="text-xs text-neutral-500 max-w-xs mt-1">
          Star your important workspaces to quickly access them here.
        </p>
      </div>
    );
  }

  if (category === "trash") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center select-none bg-white rounded-xl border border-dashed border-[#e5e7eb]">
        <div className="w-10 h-10 rounded-lg bg-neutral-100 text-neutral-500 flex items-center justify-center mb-3">
          <Trash2 className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-semibold text-neutral-900">Trash is empty</h3>
        <p className="text-xs text-neutral-500 max-w-xs mt-1">
          Projects moved to trash will appear here and can be restored anytime.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center select-none bg-white rounded-xl border border-dashed border-[#e5e7eb]">
      <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0d99ff] flex items-center justify-center mb-3.5 shadow-2xs">
        <FolderCode className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-neutral-900">Create your first project</h3>
      <p className="text-xs text-neutral-500 max-w-sm mt-1 leading-relaxed">
        Start coding with React + TypeScript, Next.js, Vanilla Web, Node.js API, or an empty project workspace.
      </p>
      <div className="flex items-center gap-2 mt-5">
        <button
          type="button"
          onClick={onOpenNewProject}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0d99ff] hover:bg-[#0b87e3] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>

        {onCreateEmptyProject && (
          <button
            type="button"
            onClick={onCreateEmptyProject}
            disabled={isCreatingEmpty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-neutral-50 text-neutral-700 text-xs font-medium shadow-2xs transition cursor-pointer disabled:opacity-60"
          >
            {isCreatingEmpty ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0d99ff]" />
            ) : (
              <FilePlus className="w-3.5 h-3.5 text-neutral-500" />
            )}
            <span>Empty Project</span>
          </button>
        )}
      </div>
    </div>
  );
}
