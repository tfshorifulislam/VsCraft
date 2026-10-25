"use client";

import { useEffect } from "react";
import { Columns2, Rows2, X } from "lucide-react";
import type { EditorSplitDirection } from "@/types/editor";

interface EditorTabContextMenuProps {
  x: number;
  y: number;
  groupId: string;
  fileId: string | null;
  canCloseGroup: boolean;
  onSplit: (groupId: string, direction: EditorSplitDirection) => void;
  onCloseGroup: (groupId: string) => void;
  onCloseTab: (groupId: string, fileId: string) => void;
  onClose: () => void;
}

export default function EditorTabContextMenu({
  x,
  y,
  groupId,
  fileId,
  canCloseGroup,
  onSplit,
  onCloseGroup,
  onCloseTab,
  onClose,
}: EditorTabContextMenuProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const menuWidth = 228;
  const menuHeight = fileId ? 188 : 132;
  const left = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        role="menu"
        aria-label="Editor tab actions"
        onClick={(e) => e.stopPropagation()}
        style={{ left, top, width: menuWidth }}
        className="fixed rounded-lg border border-[#454545] bg-[#252526] p-1 text-xs text-neutral-200 shadow-2xl"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSplit(groupId, "right");
          }}
          className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-[var(--color-primary)] hover:text-white"
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span>Split Right</span>
          <kbd className="ml-auto text-[10px] text-neutral-500">Ctrl+\</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSplit(groupId, "down");
          }}
          className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-[var(--color-primary)] hover:text-white"
        >
          <Rows2 className="h-3.5 w-3.5" />
          <span>Split Down</span>
          <kbd className="ml-auto text-[10px] text-neutral-500">Ctrl+Shift+\</kbd>
        </button>

        <div className="my-1 h-px bg-[#3c3c3c]" />

        {fileId && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onCloseTab(groupId, fileId);
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-[#3a3a3a]"
          >
            <X className="h-3.5 w-3.5" />
            <span>Close Tab</span>
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          disabled={!canCloseGroup}
          onClick={() => {
            onClose();
            onCloseGroup(groupId);
          }}
          className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left enabled:hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
          <span>Close Group</span>
        </button>
      </div>
    </div>
  );
}
