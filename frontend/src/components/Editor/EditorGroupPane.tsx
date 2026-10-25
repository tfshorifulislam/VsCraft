"use client";

import React, { type MouseEvent } from "react";
import { Columns2, Rows2, X } from "lucide-react";
import { EditorSettings, Project, ProjectFile } from "@/types/editor";
import EditorTabs from "./EditorTabs";
import MonacoEditorComponent from "./MonacoEditor";

interface EditorGroupPaneProps {
  groupId: string;
  openFiles: ProjectFile[];
  activeFile: ProjectFile | null;
  project: Project;
  settings: EditorSettings;
  unsavedFiles: Record<string, boolean>;
  focused: boolean;
  canCloseGroup: boolean;
  onFocus: (groupId: string) => void;
  onSelectTab: (groupId: string, fileId: string) => void;
  onCloseTab: (groupId: string, fileId: string, e: MouseEvent) => void;
  onTabContextMenu: (
    groupId: string,
    fileId: string | null,
    e: MouseEvent
  ) => void;
  onMoveTab: (sourceGroupId: string, fileId: string, targetGroupId: string) => void;
  onSplit: (groupId: string, direction: "right" | "down") => void;
  onCloseGroup: (groupId: string) => void;
  onChange: (fileId: string, content: string) => void;
  onSave: (fileId: string) => void;
  onCursorChange: (groupId: string, line: number, column: number) => void;
}

const toolbarButtonClass =
  "flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition hover:bg-[#37373d] hover:text-white";

function EditorGroupPane({
  groupId,
  openFiles,
  activeFile,
  project,
  settings,
  unsavedFiles,
  focused,
  canCloseGroup,
  onFocus,
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onMoveTab,
  onSplit,
  onCloseGroup,
  onChange,
  onSave,
  onCursorChange,
}: EditorGroupPaneProps) {
  return (
    <section
      data-editor-group={groupId}
      data-editor-group-active={focused ? "true" : "false"}
      onMouseDownCapture={() => onFocus(groupId)}
      className={`flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-[#1e1e1e] ${
        focused ? "ring-1 ring-inset ring-[var(--color-primary)]/45" : ""
      }`}
    >
      <EditorTabs
        groupId={groupId}
        openFiles={openFiles}
        activeFileId={activeFile?.id || null}
        unsavedFiles={unsavedFiles}
        onSelectTab={(fileId) => onSelectTab(groupId, fileId)}
        onCloseTab={(fileId, event) => onCloseTab(groupId, fileId, event)}
        onTabContextMenu={(fileId, event) => onTabContextMenu(groupId, fileId, event)}
        onMoveTab={onMoveTab}
        actions={
          <>
            <button
              type="button"
              data-action="split-right"
              aria-label="Split editor right"
              title="Split Editor Right (Ctrl+\\)"
              onClick={() => onSplit(groupId, "right")}
              className={toolbarButtonClass}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-action="split-down"
              aria-label="Split editor down"
              title="Split Editor Down (Ctrl+Shift+\\)"
              onClick={() => onSplit(groupId, "down")}
              className={toolbarButtonClass}
            >
              <Rows2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-action="close-group"
              aria-label="Close editor group"
              title="Close Editor Group"
              disabled={!canCloseGroup}
              onClick={() => onCloseGroup(groupId)}
              className={`${toolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-30`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MonacoEditorComponent
          activeFile={activeFile}
          project={project}
          settings={settings}
          onChange={(content) => {
            if (activeFile) onChange(activeFile.id, content);
          }}
          onSave={() => {
            if (activeFile) onSave(activeFile.id);
          }}
          onCursorChange={(line, column) => onCursorChange(groupId, line, column)}
        />
      </div>
    </section>
  );
}

export default React.memo(EditorGroupPane);
