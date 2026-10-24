"use client";

import React, { type MouseEvent } from "react";
import { X } from "lucide-react";
import { ProjectFile } from "@/types/editor";
import MaterialFileIcon from "./MaterialFileIcon";

interface EditorTabsProps {
  openFiles: ProjectFile[];
  activeFileId: string | null;
  unsavedFiles: Record<string, boolean>;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string, e: MouseEvent) => void;
}

function EditorTabs({
  openFiles,
  activeFileId,
  unsavedFiles,
  onSelectTab,
  onCloseTab,
}: EditorTabsProps) {
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
              <MaterialFileIcon name={file.name} path={file.path} size={14} />
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

export default React.memo(EditorTabs);
