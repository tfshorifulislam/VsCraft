"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type DragEvent,
} from "react";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  File,
  FileImage,
  Plus,
  FolderPlus,
  Upload,
  Trash2,
  Edit2,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FolderCog,
} from "lucide-react";
import { Project, ProjectFile } from "@/types/editor";
import { buildVisibleTreeRows, findRowIndex, getVirtualWindow, type NewTreeItem } from "@/lib/tree/fileTree";
import { getPublicRelativePath } from "./ImagePreviewer";

interface FileExplorerProps {
  project: Project;
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string, isFolder: boolean, parentId: string | null) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onDeleteFile: (fileId: string) => void;
  onResetProject: () => void;
  onRefresh?: () => void;
  onOpenInitializeProject?: () => void;
  onUploadFiles?: (files: FileList | File[], targetParentId: string | null) => Promise<void> | void;
}

const ROW_HEIGHT = 24;
const VIRTUAL_OVERSCAN = 8;

function renderFileIcon(file: ProjectFile, isCollapsed: boolean) {
  if (file.isFolder) {
    return isCollapsed ? (
      <Folder className="w-4 h-4 text-amber-400 shrink-0" />
    ) : (
      <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "tsx":
    case "jsx":
      return <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />;
    case "ts":
    case "js":
      return <FileCode className="w-4 h-4 text-yellow-400 shrink-0" />;
    case "css":
      return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
    case "html":
      return <FileCode className="w-4 h-4 text-orange-400 shrink-0" />;
    case "json":
      return <FileJson className="w-4 h-4 text-amber-300 shrink-0" />;
    case "md":
      return <FileText className="w-4 h-4 text-neutral-400 shrink-0" />;
    case "py":
      return <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif":
    case "svg":
    case "ico":
    case "bmp":
    case "avif":
      return <FileImage className="w-4 h-4 text-purple-400 shrink-0" />;
    default:
      return <File className="w-4 h-4 text-neutral-400 shrink-0" />;
  }
}

interface FileTreeRowProps {
  file: ProjectFile;
  level: number;
  isActive: boolean;
  isCollapsed: boolean;
  isDropTarget: boolean;
  isEditing: boolean;
  editingName: string;
  isCopied: boolean;
  onEditingNameChange: (name: string) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onToggleFolder: (id: string) => void;
  onSelectFile: (id: string) => void;
  onStartCreate: (isFolder: boolean, parentId: string | null) => void;
  onStartRename: (file: ProjectFile, e: MouseEvent) => void;
  onConfirmDelete: (file: ProjectFile, e: MouseEvent) => void;
  onCopyRelativePath: (file: ProjectFile, e: MouseEvent) => void;
  onTriggerUpload: (folderId: string | null, e?: MouseEvent) => void;
  onUploadFiles?: (files: FileList | File[], targetParentId: string | null) => Promise<void> | void;
  onDragOverFolder: (id: string | null) => void;
  onDropOnFolder: (folderId: string, files: FileList) => void;
}

const FileTreeRow = React.memo(function FileTreeRow({
  file,
  level,
  isActive,
  isCollapsed,
  isDropTarget,
  isEditing,
  editingName,
  isCopied,
  onEditingNameChange,
  onSubmitRename,
  onCancelRename,
  onToggleFolder,
  onSelectFile,
  onStartCreate,
  onStartRename,
  onConfirmDelete,
  onCopyRelativePath,
  onTriggerUpload,
  onUploadFiles,
  onDragOverFolder,
  onDropOnFolder,
}: FileTreeRowProps) {
  return (
    <div
      onClick={() => {
        if (file.isFolder) {
          onToggleFolder(file.id);
        } else {
          onSelectFile(file.id);
        }
      }}
      onDragOver={(e) => {
        if (!file.isFolder) return;
        e.preventDefault();
        e.stopPropagation();
        onDragOverFolder(file.id);
      }}
      onDragLeave={(e) => {
        if (file.isFolder) {
          e.preventDefault();
          e.stopPropagation();
          onDragOverFolder(null);
        }
      }}
      onDrop={(e) => {
        if (!file.isFolder) return;
        e.preventDefault();
        e.stopPropagation();
        onDragOverFolder(null);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onDropOnFolder(file.id, e.dataTransfer.files);
        }
      }}
      style={{
        height: ROW_HEIGHT,
        paddingLeft: `${Math.max(level * 14 + 10, 10)}px`,
      }}
      className={`group flex items-center justify-between pr-2 text-xs font-mono rounded cursor-pointer transition-colors ${
        isDropTarget
          ? "bg-[var(--color-primary)]/20 border border-[var(--color-primary)] text-white"
          : isActive
            ? "bg-[#37373d] text-white font-medium"
            : "text-neutral-300 hover:bg-[#2a2d2e] hover:text-white"
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {file.isFolder ? (
          <span className="text-neutral-500">
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </span>
        ) : (
          <span className="w-3.5" />
        )}
        {renderFileIcon(file, isCollapsed)}

        {isEditing ? (
          <input
            type="text"
            value={editingName}
            autoFocus
            onChange={(e) => onEditingNameChange(e.target.value)}
            onBlur={onSubmitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitRename();
              if (e.key === "Escape") onCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1e1e1e] text-white border border-[var(--color-primary)] px-1 py-0.5 rounded text-xs outline-none w-full"
          />
        ) : (
          <span className="truncate">{file.name}</span>
        )}
      </div>

      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
        {!file.isFolder && (
          <button
            type="button"
            onClick={(e) => onCopyRelativePath(file, e)}
            title={`Copy Relative Path (${getPublicRelativePath(file.path)})`}
            className="p-1 hover:text-white text-neutral-400"
          >
            {isCopied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}

        {file.isFolder && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartCreate(false, file.id);
              }}
              title="New file in folder"
              className="p-1 hover:text-white text-neutral-400"
            >
              <Plus className="w-3 h-3" />
            </button>
            {onUploadFiles && (
              <button
                type="button"
                onClick={(e) => onTriggerUpload(file.id, e)}
                title="Upload file into folder"
                className="p-1 hover:text-white text-neutral-400"
              >
                <Upload className="w-3 h-3" />
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={(e) => onStartRename(file, e)}
          title="Rename"
          className="p-1 hover:text-white text-neutral-400"
        >
          <Edit2 className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={(e) => onConfirmDelete(file, e)}
          title="Delete"
          className="p-1 hover:text-rose-400 text-neutral-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

function FileExplorer({
  project,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onResetProject,
  onRefresh,
  onOpenInitializeProject,
  onUploadFiles,
}: FileExplorerProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState<NewTreeItem | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [activeUploadTargetFolder, setActiveUploadTargetFolder] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(
    () => buildVisibleTreeRows(project.files, collapsedFolders, isCreating),
    [project.files, collapsedFolders, isCreating]
  );

  const virtualWindow = useMemo(
    () => getVirtualWindow(scrollTop, viewportHeight, rows.length, ROW_HEIGHT, VIRTUAL_OVERSCAN),
    [scrollTop, viewportHeight, rows.length]
  );

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const update = () => setViewportHeight(element.clientHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const maxScrollTop = Math.max(0, rows.length * ROW_HEIGHT - element.clientHeight);
    if (element.scrollTop > maxScrollTop) {
      element.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
    }
  }, [rows.length, viewportHeight]);

  useEffect(() => {
    const element = listRef.current;
    const index = findRowIndex(rows, activeFileId);
    if (!element || index < 0) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = Math.max(0, top - element.clientHeight / 2);
      setScrollTop(element.scrollTop);
    }
  }, [activeFileId, rows]);

  const toggleFolder = useCallback((id: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const startCreate = useCallback(
    (isFolder: boolean, parentId: string | null = null) => {
      setIsCreating({ isFolder, parentId });
      setNewItemName("");
      if (parentId) {
        setCollapsedFolders((prev) => (prev[parentId] ? { ...prev, [parentId]: false } : prev));
      }
    },
    []
  );

  const submitCreate = useCallback(() => {
    if (!newItemName.trim() || !isCreating) {
      setIsCreating(null);
      return;
    }
    onCreateFile(newItemName.trim(), isCreating.isFolder, isCreating.parentId);
    setIsCreating(null);
    setNewItemName("");
  }, [newItemName, isCreating, onCreateFile]);

  const startRename = useCallback((file: ProjectFile, e: MouseEvent) => {
    e.stopPropagation();
    setEditingFileId(file.id);
    setEditingName(file.name);
  }, []);

  const submitRename = useCallback(() => {
    if (editingFileId && editingName.trim()) {
      onRenameFile(editingFileId, editingName.trim());
    }
    setEditingFileId(null);
  }, [editingFileId, editingName, onRenameFile]);

  const confirmDelete = useCallback(
    (file: ProjectFile, e: MouseEvent) => {
      e.stopPropagation();
      const confirmed = window.confirm(
        `Delete ${file.isFolder ? "folder" : "file"} "${file.name}"?`
      );
      if (confirmed) onDeleteFile(file.id);
    },
    [onDeleteFile]
  );

  const copyRelativePath = useCallback((file: ProjectFile, e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getPublicRelativePath(file.path));
    setCopiedFileId(file.id);
    setTimeout(() => {
      setCopiedFileId((prev) => (prev === file.id ? null : prev));
    }, 2000);
  }, []);

  const triggerUpload = useCallback((targetFolderId: string | null = null, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveUploadTargetFolder(targetFolderId);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onUploadFiles) {
      onUploadFiles(e.target.files, activeUploadTargetFolder);
    }
  };

  const handleDragOverRoot = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOverRoot) setIsDraggingOverRoot(true);
  };

  const handleDragLeaveRoot = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingOverRoot(false);
      setDragOverFolderId(null);
    }
  };

  const handleDropRoot = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverRoot(false);
    const targetFolder = dragOverFolderId;
    setDragOverFolderId(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onUploadFiles) {
      onUploadFiles(e.dataTransfer.files, targetFolder);
    }
  };

  const renderNewItemInput = (level: number) => (
    <div
      style={{
        height: ROW_HEIGHT,
        paddingLeft: `${Math.max(level * 14 + 10, 10)}px`,
      }}
      className="flex items-center gap-2 pr-2 bg-[#252526]"
    >
      {isCreating?.isFolder ? (
        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
      ) : (
        <File className="w-4 h-4 text-neutral-400 shrink-0" />
      )}
      <input
        type="text"
        autoFocus
        value={newItemName}
        placeholder={isCreating?.isFolder ? "Folder name..." : "File name..."}
        onChange={(e) => setNewItemName(e.target.value)}
        onBlur={submitCreate}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitCreate();
          if (e.key === "Escape") setIsCreating(null);
        }}
        className="bg-[#1e1e1e] text-white border border-[var(--color-primary)] px-1.5 py-0.5 rounded text-xs outline-none w-full font-mono"
      />
    </div>
  );

  const visibleRows = rows.slice(virtualWindow.start, virtualWindow.end);

  return (
    <div
      onDragOver={handleDragOverRoot}
      onDragLeave={handleDragLeaveRoot}
      onDrop={handleDropRoot}
      className={`h-full flex flex-col bg-[#252526] select-none text-neutral-300 relative transition-colors ${
        isDraggingOverRoot ? "bg-[#202022] ring-1 ring-inset ring-[var(--color-primary)]/50" : ""
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div className="h-9 px-3 border-b border-[#333333] flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">
        <span className="truncate" title={`${project.files.length.toLocaleString()} files`}>
          {project.name}
        </span>
        <div className="flex items-center gap-1">
          {onOpenInitializeProject && (
            <button
              type="button"
              onClick={onOpenInitializeProject}
              title="Initialize Framework / Add Tooling"
              className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer text-amber-400 hover:text-amber-300"
            >
              <FolderCog className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => startCreate(false, null)}
            title="New File"
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => startCreate(true, null)}
            title="New Folder"
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          {onUploadFiles && (
            <button
              type="button"
              onClick={(e) => triggerUpload(null, e)}
              title="Upload Files (PNG, JPG, SVG, etc.)"
              className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh || onResetProject}
            title="Refresh File Explorer"
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {isDraggingOverRoot && (
        <div className="absolute inset-0 top-9 bg-[var(--color-primary)]/10 backdrop-blur-2xs z-30 flex flex-col items-center justify-center pointer-events-none p-4 text-center border-2 border-dashed border-[var(--color-primary)]">
          <Upload className="w-8 h-8 text-[var(--color-primary)] mb-2 animate-bounce" />
          <span className="text-xs font-semibold text-white">
            {dragOverFolderId ? "Drop files into folder" : "Drop files to upload to workspace"}
          </span>
          <span className="text-[10px] text-neutral-400 mt-1">Supports images, SVG, code, JSON</span>
        </div>
      )}

      <div
        ref={listRef}
        data-testid="file-tree-viewport"
        className="flex-1 overflow-y-auto py-1"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {project.files.length === 0 && !isCreating ? (
          <div className="p-4 text-center space-y-3.5 select-none">
            <div className="w-10 h-10 rounded-xl bg-[#2a2d2e] border border-[#3c3c3c] flex items-center justify-center mx-auto text-neutral-400">
              <FolderPlus className="w-5 h-5 text-neutral-400" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-neutral-200">Empty Workspace</h4>
              <p className="text-[11px] text-neutral-400 leading-relaxed px-1">
                This project has no files yet. Create files, upload assets, or initialize a framework.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => startCreate(false, null)}
                className="w-full py-1.5 px-3 bg-[#333333] hover:bg-[#3c3c3c] text-white rounded text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New File</span>
              </button>
              <button
                type="button"
                onClick={() => startCreate(true, null)}
                className="w-full py-1.5 px-3 bg-[#2a2d2e] hover:bg-[#333333] text-neutral-300 hover:text-white rounded text-xs font-medium flex items-center justify-center gap-2 border border-[#3c3c3c] transition cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New Folder</span>
              </button>
              {onUploadFiles && (
                <button
                  type="button"
                  onClick={(e) => triggerUpload(null, e)}
                  className="w-full py-1.5 px-3 bg-[#2a2d2e] hover:bg-[#333333] text-neutral-300 hover:text-white rounded text-xs font-medium flex items-center justify-center gap-2 border border-[#3c3c3c] transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Files / Images</span>
                </button>
              )}
              {onOpenInitializeProject && (
                <button
                  type="button"
                  onClick={onOpenInitializeProject}
                  className="w-full py-1.5 px-3 bg-[var(--color-primary)] hover:opacity-90 text-white rounded text-xs font-medium flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <FolderCog className="w-3.5 h-3.5" />
                  <span>Initialize Framework</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
            {visibleRows.map((row, index) => {
              const top = (virtualWindow.start + index) * ROW_HEIGHT;
              if (row.kind === "new") {
                return (
                  <div
                    key={row.key}
                    style={{ position: "absolute", top, left: 0, right: 0 }}
                  >
                    {renderNewItemInput(row.level)}
                  </div>
                );
              }

              const file = row.file;
              return (
                <div
                  key={row.key}
                  style={{ position: "absolute", top, left: 0, right: 0 }}
                >
                  <FileTreeRow
                    file={file}
                    level={row.level}
                    isActive={activeFileId === file.id}
                    isCollapsed={!!collapsedFolders[file.id]}
                    isDropTarget={dragOverFolderId === file.id}
                    isEditing={editingFileId === file.id}
                    editingName={editingName}
                    isCopied={copiedFileId === file.id}
                    onEditingNameChange={setEditingName}
                    onSubmitRename={submitRename}
                    onCancelRename={() => setEditingFileId(null)}
                    onToggleFolder={toggleFolder}
                    onSelectFile={onSelectFile}
                    onStartCreate={startCreate}
                    onStartRename={startRename}
                    onConfirmDelete={confirmDelete}
                    onCopyRelativePath={copyRelativePath}
                    onTriggerUpload={triggerUpload}
                    onUploadFiles={onUploadFiles}
                    onDragOverFolder={setDragOverFolderId}
                    onDropOnFolder={(folderId, files) => onUploadFiles?.(files, folderId)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(FileExplorer);
