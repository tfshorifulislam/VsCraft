"use client";

import React, { type MouseEvent } from "react";
import {
  FileCode,
  FileText,
  FileJson,
  File,
  X,
} from "lucide-react";
import { ProjectFile } from "@/types/editor";

interface EditorTabsProps {
  openFiles: ProjectFile[];
  activeFileId: string | null;
  unsavedFiles: Record<string, boolean>;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string, e: MouseEvent) => void;
}

export default function EditorTabs({
  openFiles,
  activeFileId,
  unsavedFiles,
  onSelectTab,
  onCloseTab,
}: EditorTabsProps) {
  const renderTabIcon = (file: ProjectFile) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "tsx":
      case "jsx":
        return <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case "ts":
      case "js":
        return <FileCode className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
      case "css":
        return <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case "html":
        return <FileCode className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
      case "json":
        return <FileJson className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
      default:
        return <File className="w-3.5 h-3.5 text-neutral-400 shrink-0" />;
    }
  };

  return (
    <div className="h-9 bg-[#252526] border-b border-[#1e1e1e] flex items-center justify-between select-none overflow-x-auto no-scrollbar">
      {/* Tab List */}
      <div className="flex items-center h-full overflow-x-auto no-scrollbar">
        {openFiles.map((file) => {
          const isActive = activeFileId === file.id;
          const isUnsaved = !!unsavedFiles[file.id];

          return (
            <div
              key={file.id}
              onClick={() => onSelectTab(file.id)}
              className={`group flex items-center gap-2 h-full px-3.5 text-xs font-mono border-r border-[#1e1e1e] cursor-pointer transition-colors relative shrink-0 ${
                isActive
                  ? "bg-[#1e1e1e] text-white border-t-2 border-t-[var(--color-primary)] font-medium"
                  : "bg-[#2d2d2d] text-neutral-400 hover:bg-[#282828] hover:text-neutral-200"
              }`}
            >
              {renderTabIcon(file)}
              <span>{file.name}</span>

              {/* Dirty indicator or close button */}
              <button
                type="button"
                onClick={(e) => onCloseTab(file.id, e)}
                title={isUnsaved ? "Unsaved changes (close tab)" : "Close tab"}
                className="w-4 h-4 rounded flex items-center justify-center hover:bg-neutral-700/80 hover:text-rose-400 text-neutral-400 transition"
              >
                {isUnsaved ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400 group-hover:hidden" />
                ) : null}
                <X
                  className={`w-3 h-3 ${
                    isUnsaved ? "hidden group-hover:block" : ""
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
