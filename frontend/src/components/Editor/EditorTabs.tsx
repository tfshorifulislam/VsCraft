"use client";

import React, { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { ProjectFile } from "@/types/editor";
import { EDITOR_TAB_DRAG_TYPE } from "@/lib/editor/editorGroups";
import MaterialFileIcon from "./MaterialFileIcon";

interface EditorTabsProps {
  groupId: string;
  openFiles: ProjectFile[];
  activeFileId: string | null;
  unsavedFiles: Record<string, boolean>;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string, e: MouseEvent) => void;
  onTabContextMenu?: (fileId: string | null, e: MouseEvent) => void;
  onMoveTab?: (sourceGroupId: string, fileId: string, targetGroupId: string) => void;
  actions?: ReactNode;
}

interface DraggedEditorTab {
  groupId: string;
  fileId: string;
}

function readDraggedTab(dataTransfer: DataTransfer): DraggedEditorTab | null {
  try {
    const payload = JSON.parse(dataTransfer.getData(EDITOR_TAB_DRAG_TYPE)) as DraggedEditorTab;
    if (!payload?.groupId || !payload?.fileId) return null;
    return payload;
  } catch {
    return null;
  }
}

function EditorTabs({
  groupId,
  openFiles,
  activeFileId,
  unsavedFiles,
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onMoveTab,
  actions,
}: EditorTabsProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!onMoveTab || !e.dataTransfer.types.includes(EDITOR_TAB_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!onMoveTab) return;
    const dragged = readDraggedTab(e.dataTransfer);
    setIsDragOver(false);
    if (!dragged) return;
    e.preventDefault();
    onMoveTab(dragged.groupId, dragged.fileId, groupId);
  };

  return (
    <div
      className={`h-9 bg-[#252526] border-b flex items-center justify-between select-none overflow-hidden ${
        isDragOver
          ? "border-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/60"
          : "border-[#1e1e1e]"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDragOver(false);
        }
      }}
      onDrop={handleDrop}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-editor-tab]")) return;
        e.preventDefault();
        onTabContextMenu?.(null, e);
      }}
    >
      <div className="flex items-center h-full overflow-x-auto no-scrollbar min-w-0">
        {openFiles.map((file) => {
          const isActive = activeFileId === file.id;
          const isUnsaved = !!unsavedFiles[file.id];

          return (
            <div
              key={file.id}
              data-editor-tab={file.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  EDITOR_TAB_DRAG_TYPE,
                  JSON.stringify({ groupId, fileId: file.id })
                );
              }}
              onDragEnd={() => setIsDragOver(false)}
              onClick={() => onSelectTab(file.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTabContextMenu?.(file.id, e);
              }}
              className={`group flex items-center gap-2 h-full px-3.5 text-xs font-mono border-r border-[#1e1e1e] cursor-pointer transition-colors relative shrink-0 ${
                isActive
                  ? "bg-[#1e1e1e] text-white border-t-2 border-t-[var(--color-primary)] font-medium"
                  : "bg-[#2d2d2d] text-neutral-400 hover:bg-[#282828] hover:text-neutral-200"
              }`}
            >
              <MaterialFileIcon name={file.name} path={file.path} size={14} />
              <span>{file.name}</span>

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
      {actions && <div className="flex items-center gap-0.5 px-1 shrink-0">{actions}</div>}
    </div>
  );
}

export default React.memo(EditorTabs);
