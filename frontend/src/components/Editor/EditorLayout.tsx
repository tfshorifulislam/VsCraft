"use client";

import React, { useState, useEffect, useCallback, useRef, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ActivityBar from "./ActivityBar";
import FileExplorer from "./FileExplorer";
import EditorTabs from "./EditorTabs";
import MonacoEditorComponent from "./MonacoEditor";
import TerminalPanel from "./TerminalPanel";
import PreviewPanel from "./PreviewPanel";
import AIAssistantPanel from "./AIAssistantPanel";
import StatusBar from "./StatusBar";
import CommandPalette, { CommandItem } from "./CommandPalette";
import GitPanel from "./GitPanel";
import DebugPanel from "./DebugPanel";
import ExtensionsPanel from "./ExtensionsPanel";
import InitializeProjectDialog from "./InitializeProjectDialog";
import { cloudApi } from "@/lib/cloud/cloudApi";
import {
  Project,
  ProjectFile,
  SidebarView,
  BottomTab,
  EditorSettings,
  ConsoleMessage,
} from "@/types/editor";
import {
  loadEditorSettings,
  saveEditorSettings,
  exportProjectAsJSON,
} from "@/lib/storage/projectStorage";
import {
  Search,
  FileCode,
  FolderGit2,
  Download,
  Plus,
  Sparkles,
  FolderCog,
  Save,
  Terminal as TerminalIcon,
  Play,
  X,
  ArrowLeft,
  Cloud,
  Loader2,
  AlertCircle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

let layoutCounter = 1000;
function getEditorUniqueId(prefix: string): string {
  layoutCounter += 1;
  return `${prefix}-${layoutCounter}`;
}
function getTimestamp(): number {
  return Date.now();
}

interface EditorLayoutProps {
  initialProjectId?: string;
}

export default function EditorLayout({ initialProjectId }: EditorLayoutProps) {
  const router = useRouter();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inMemoryFileContentsRef = useRef<Map<string, string>>(new Map());
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");

  // 1. Core Cloud Project State
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(true);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [unsavedFiles, setUnsavedFiles] = useState<Record<string, boolean>>({});

  // 2. Views & Panels
  const [activeSidebarView, setActiveSidebarView] = useState<SidebarView | null>("explorer");
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalTab, setTerminalTab] = useState<BottomTab>("terminal");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isInitializeDialogOpen, setIsInitializeDialogOpen] = useState(false);

  // 3. Settings & Diagnostics
  const [settings, setSettings] = useState<EditorSettings>(() => loadEditorSettings());
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch full cloud project when initialProjectId changes
  useEffect(() => {
    if (!initialProjectId) {
      router.push("/projects");
      return;
    }

    let isCancelled = false;
    setIsLoadingProject(true);
    setProjectLoadError(null);
    setIsPreviewOpen(false);
    setIsTerminalOpen(false);

    async function loadWorkspaceProject() {
      try {
        const cloudProj = await cloudApi.projects.get(initialProjectId!);
        if (isCancelled) return;

        if (!cloudProj) {
          setProjectLoadError("Project not found or unauthorized.");
          setIsLoadingProject(false);
          return;
        }

        // Validate activeFileId
        let activeId = cloudProj.activeFileId;
        const fileExists = activeId && cloudProj.files.some((f) => f.id === activeId && !f.isFolder);
        if (!fileExists) {
          const priorityCandidates = [
            "src/app/page.tsx",
            "app/page.tsx",
            "src/App.tsx",
            "src/main.tsx",
            "index.html",
            "server.js",
            "main.py",
            "main.cpp",
            "main.go",
          ];
          const foundPriority = cloudProj.files.find((f) => !f.isFolder && priorityCandidates.includes(f.path));
          const firstNonFolder = foundPriority || cloudProj.files.find((f) => !f.isFolder);
          activeId = firstNonFolder ? firstNonFolder.id : null;
        }

        const validOpenIds = (cloudProj.openFileIds || []).filter((id) =>
          cloudProj.files.some((f) => f.id === id && !f.isFolder)
        );
        if (activeId && !validOpenIds.includes(activeId)) {
          validOpenIds.push(activeId);
        }

        setActiveProject({
          ...cloudProj,
          activeFileId: activeId,
          openFileIds: validOpenIds,
        });

        // Also load cloud projects list for project switcher modal
        cloudApi.projects
          .list("all")
          .then((list) => {
            if (!isCancelled) setProjectsList(list);
          })
          .catch(() => {});
      } catch (err: unknown) {
        if (!isCancelled) {
          if (err instanceof Error && err.message === "UNAUTHORIZED") {
            router.push(`/login?from=/editor/${initialProjectId}`);
            return;
          }
          setProjectLoadError(
            err instanceof Error ? err.message : "Failed to load project from workspace."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingProject(false);
        }
      }
    }

    loadWorkspaceProject();
    return () => {
      isCancelled = true;
    };
  }, [initialProjectId, router]);

  // Warn on tab close/reload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved" || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  // Active file helper
  const activeFile = activeProject?.files.find((f) => f.id === activeProject.activeFileId) || null;
  const openFiles = (activeProject?.openFileIds || [])
    .map((id) => activeProject?.files.find((f) => f.id === id))
    .filter((f): f is ProjectFile => !!f && !f.isFolder);

  // Save implementation: writes to database and physical filesystem
  const performCloudSave = useCallback(
    async (fileId: string, content: string) => {
      if (!activeProject) return;
      setSaveStatus("saving");
      try {
        const res = await cloudApi.files.saveContent(activeProject.id, fileId, content);
        if (res.error) {
          setSaveStatus("error");
          setConsoleMessages((prev) => [
            ...prev,
            {
              id: getEditorUniqueId("err"),
              type: "error",
              content: `Save failed: ${res.error}`,
              timestamp: getTimestamp(),
            },
          ]);
          return;
        }

        if (res.file) {
          const updatedVersion = res.file.version;
          setActiveProject((prev) => {
            if (!prev) return null;
            const currentInMemory = inMemoryFileContentsRef.current.get(fileId) ?? content;
            return {
              ...prev,
              files: prev.files.map((f) =>
                f.id === fileId ? { ...f, content: currentInMemory, version: updatedVersion } : f
              ),
              updatedAt: getTimestamp(),
            };
          });
        }

        const latestInMemory = inMemoryFileContentsRef.current.get(fileId) ?? content;
        if (latestInMemory === content) {
          setSaveStatus("saved");
          setUnsavedFiles((prev) => ({ ...prev, [fileId]: false }));
        }
      } catch (err) {
        setSaveStatus("error");
        setConsoleMessages((prev) => [
          ...prev,
          {
            id: getEditorUniqueId("err"),
            type: "error",
            content: `Save failed: ${err instanceof Error ? err.message : "Network error"}`,
            timestamp: getTimestamp(),
          },
        ]);
      }
    },
    [activeProject]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!activeProject || !activeFile) return;

      inMemoryFileContentsRef.current.set(activeFile.id, newContent);
      setSaveStatus("unsaved");
      setUnsavedFiles((prev) => (prev[activeFile.id] ? prev : { ...prev, [activeFile.id]: true }));

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const latest = inMemoryFileContentsRef.current.get(activeFile.id) ?? newContent;
        performCloudSave(activeFile.id, latest);
      }, 1000);
    },
    [activeProject, activeFile, performCloudSave]
  );

  const handleSaveActiveFile = useCallback(() => {
    if (!activeProject || !activeFile) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    const latest = inMemoryFileContentsRef.current.get(activeFile.id) ?? activeFile.content;
    performCloudSave(activeFile.id, latest);
    setConsoleMessages((prev) => [
      ...prev,
      {
        id: getEditorUniqueId("c"),
        type: "info",
        content: `✓ Saved ${activeFile.path}`,
        timestamp: getTimestamp(),
      },
    ]);
  }, [activeProject, activeFile, performCloudSave]);

  const handleSelectFile = useCallback(
    (fileId: string) => {
      if (!activeProject) return;
      const file = activeProject.files.find((f) => f.id === fileId);
      if (!file || file.isFolder) return;

      // If switching away from an unsaved file, flush save immediately
      if (activeFile && unsavedFiles[activeFile.id]) {
        const latest = inMemoryFileContentsRef.current.get(activeFile.id) ?? activeFile.content;
        performCloudSave(activeFile.id, latest);
      }

      const nextOpen = activeProject.openFileIds.includes(fileId)
        ? activeProject.openFileIds
        : [...activeProject.openFileIds, fileId];

      setActiveProject((prev) => {
        if (!prev) return null;
        // Merge any in-memory buffer edits into files
        const mergedFiles = prev.files.map((f) => {
          if (inMemoryFileContentsRef.current.has(f.id)) {
            return { ...f, content: inMemoryFileContentsRef.current.get(f.id)! };
          }
          return f;
        });
        return {
          ...prev,
          files: mergedFiles,
          activeFileId: fileId,
          openFileIds: nextOpen,
          updatedAt: getTimestamp(),
        };
      });
    },
    [activeProject, activeFile, unsavedFiles, performCloudSave]
  );

  const handleCloseTab = (fileId: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!activeProject) return;

    // If tab being closed has unsaved changes, flush save
    const closingFile = activeProject.files.find((f) => f.id === fileId);
    if (closingFile && unsavedFiles[fileId]) {
      const latest = inMemoryFileContentsRef.current.get(fileId) ?? closingFile.content;
      performCloudSave(fileId, latest);
    }
    inMemoryFileContentsRef.current.delete(fileId);

    const nextOpen = activeProject.openFileIds.filter((id) => id !== fileId);
    let nextActive = activeProject.activeFileId;

    if (activeProject.activeFileId === fileId) {
      nextActive = nextOpen.length > 0 ? nextOpen[nextOpen.length - 1] : null;
    }

    setUnsavedFiles((prev) => {
      const copy = { ...prev };
      delete copy[fileId];
      return copy;
    });

    setActiveProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        activeFileId: nextActive,
        openFileIds: nextOpen,
        updatedAt: getTimestamp(),
      };
    });
  };

  const handleCreateFile = async (name: string, isFolder: boolean, parentId: string | null) => {
    if (!activeProject) return;

    try {
      const serverFile = await cloudApi.files.create(activeProject.id, {
        name,
        isFolder,
        parentId,
        content: isFolder ? "" : `// ${name}\n`,
      });

      if (serverFile) {
        setActiveProject((prev) => {
          if (!prev) return null;
          const nextFiles = [...prev.files, serverFile];
          const nextOpen = isFolder ? prev.openFileIds : [...prev.openFileIds, serverFile.id];
          return {
            ...prev,
            files: nextFiles,
            openFileIds: nextOpen,
            activeFileId: isFolder ? prev.activeFileId : serverFile.id,
            updatedAt: getTimestamp(),
          };
        });
      }
    } catch (err) {
      console.error("Cloud file creation error:", err);
      setConsoleMessages((prev) => [
        ...prev,
        {
          id: getEditorUniqueId("err"),
          type: "error",
          content: `Failed to create file: ${err instanceof Error ? err.message : "Error"}`,
          timestamp: getTimestamp(),
        },
      ]);
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (!activeProject) return;

    try {
      const updated = await cloudApi.files.rename(activeProject.id, fileId, newName);
      if (updated) {
        setActiveProject((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            files: prev.files.map((f) => (f.id === fileId ? updated : f)),
            updatedAt: getTimestamp(),
          };
        });
      }
    } catch (err) {
      console.error("File rename error:", err);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!activeProject) return;

    try {
      await cloudApi.files.delete(activeProject.id, fileId);

      // Collect descendant ids if folder
      const toDeleteIds = new Set<string>([fileId]);
      const findChildren = (pid: string) => {
        activeProject.files.forEach((f) => {
          if (f.parentId === pid) {
            toDeleteIds.add(f.id);
            findChildren(f.id);
          }
        });
      };
      findChildren(fileId);

      setActiveProject((prev) => {
        if (!prev) return null;
        const nextFiles = prev.files.filter((f) => !toDeleteIds.has(f.id));
        const nextOpen = prev.openFileIds.filter((id) => !toDeleteIds.has(id));
        const nextActive = toDeleteIds.has(prev.activeFileId || "")
          ? nextOpen[nextOpen.length - 1] || null
          : prev.activeFileId;

        return {
          ...prev,
          files: nextFiles,
          openFileIds: nextOpen,
          activeFileId: nextActive,
          updatedAt: getTimestamp(),
        };
      });
    } catch (err) {
      console.error("File delete error:", err);
    }
  };

  const handleUploadFiles = async (files: FileList | File[], targetFolderId: string | null = null) => {
    if (!activeProject || files.length === 0) return;

    let targetFolderPath = "";
    if (targetFolderId) {
      const folder = activeProject.files.find((f) => f.id === targetFolderId && f.isFolder);
      if (folder) targetFolderPath = folder.path;
    }

    const fileList = Array.from(files);

    try {
      setConsoleMessages((prev) => [
        ...prev,
        {
          id: getEditorUniqueId("up"),
          type: "info",
          content: `Uploading ${fileList.length} file(s) into workspace...`,
          timestamp: getTimestamp(),
        },
      ]);

      const uploadedFiles = await cloudApi.files.upload(activeProject.id, fileList, targetFolderPath);

      if (uploadedFiles && uploadedFiles.length > 0) {
        setActiveProject((prev) => {
          if (!prev) return null;
          const map = new Map<string, ProjectFile>();
          for (const f of prev.files) map.set(f.path, f);
          for (const u of uploadedFiles) map.set(u.path, u);
          const nextFiles = Array.from(map.values());

          const first = uploadedFiles[0];
          const nextOpen =
            first && !first.isFolder && !prev.openFileIds.includes(first.id)
              ? [...prev.openFileIds, first.id]
              : prev.openFileIds;

          return {
            ...prev,
            files: nextFiles,
            openFileIds: nextOpen,
            activeFileId: first && !first.isFolder ? first.id : prev.activeFileId,
            updatedAt: getTimestamp(),
          };
        });

        setConsoleMessages((prev) => [
          ...prev,
          {
            id: getEditorUniqueId("up_done"),
            type: "info",
            content: `✓ Successfully uploaded ${uploadedFiles.length} file(s) to cloud workspace.`,
            timestamp: getTimestamp(),
          },
        ]);
      }
    } catch (err) {
      console.error("Upload error:", err);
      setConsoleMessages((prev) => [
        ...prev,
        {
          id: getEditorUniqueId("up_err"),
          type: "error",
          content: `Failed to upload files: ${err instanceof Error ? err.message : "Network/server error"}`,
          timestamp: getTimestamp(),
        },
      ]);
    }
  };

  const handleApplyDiff = (fileId: string, newContent: string) => {
    if (!activeProject) return;
    const targetFile = activeProject.files.find((f) => f.id === fileId);
    if (!targetFile) return;

    performCloudSave(fileId, newContent);
    setConsoleMessages((prev) => [
      ...prev,
      {
        id: getEditorUniqueId("ai"),
        type: "info",
        content: `✓ AI Diff applied and saved to ${targetFile.path}`,
        timestamp: getTimestamp(),
      },
    ]);
  };

  const handleConsoleMessage = (type: "log" | "error" | "warn" | "info", text: string) => {
    setConsoleMessages((prev) => [
      ...prev.slice(-100),
      {
        id: getEditorUniqueId("msg"),
        type,
        content: text,
        timestamp: getTimestamp(),
      },
    ]);
  };

  const unsavedFilesRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    unsavedFilesRef.current = unsavedFiles;
  }, [unsavedFiles]);

  const handleCursorChange = useCallback((line: number, column: number) => {
    setCursorPos({ line, column });
  }, []);

  const handleClearConsole = useCallback(() => {
    setConsoleMessages([]);
  }, []);

  const handleToggleTerminal = useCallback(() => {
    setIsTerminalOpen((prev) => !prev);
  }, []);

  const handleCloseTerminal = useCallback(() => {
    setIsTerminalOpen(false);
  }, []);

  const handleSelectTerminalTab = useCallback((tab: BottomTab) => {
    setTerminalTab(tab);
  }, []);

  const handleFilesSynced = useCallback((updatedFiles: ProjectFile[]) => {
    setActiveProject((prev) => {
      if (!prev) return null;
      const currentActiveId = prev.activeFileId;
      // Do not overwrite any file that has pending in-memory edits or unsaved state
      const merged = updatedFiles.map((newFile) => {
        if (inMemoryFileContentsRef.current.has(newFile.id)) {
          return { ...newFile, content: inMemoryFileContentsRef.current.get(newFile.id)! };
        }
        if (newFile.id === currentActiveId && unsavedFilesRef.current[currentActiveId]) {
          const currentFile = prev.files.find((f) => f.id === currentActiveId);
          return currentFile || newFile;
        }
        return newFile;
      });
      return {
        ...prev,
        files: merged,
        updatedAt: getTimestamp(),
      };
    });
  }, []);

  const handleRefreshWorkspaceFiles = useCallback(async () => {
    if (!activeProject?.id) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/sync`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.files && Array.isArray(data.files)) {
          handleFilesSynced(data.files);
        }
      }
    } catch (err) {
      console.warn("Manual workspace refresh failed:", err);
    }
  }, [activeProject?.id, handleFilesSynced]);

  const handleRunPreview = useCallback(() => {
    if (activeFile && unsavedFiles[activeFile.id]) {
      handleSaveActiveFile();
    }
    setIsPreviewOpen(true);
    setPreviewRefreshKey((k) => k + 1);
    setConsoleMessages((prev) => [
      ...prev,
      {
        id: getEditorUniqueId("prev-run"),
        type: "info",
        content: "▶ Run Preview: Triggered application refresh...",
        timestamp: getTimestamp(),
      },
    ]);
  }, [activeFile, unsavedFiles, handleSaveActiveFile]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Allow terminal to receive its own keys without editor shortcut interception
      const isInsideTerminal = Boolean((e.target as HTMLElement)?.closest(".xterm"));
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isInsideTerminal && !(isCmdOrCtrl && e.key === "`")) {
        return;
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveActiveFile();
      } else if (e.key === "F5") {
        e.preventDefault();
        handleRunPreview();
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setIsAIOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "p" && !e.shiftKey) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setActiveSidebarView((prev) => (prev ? null : "explorer"));
      } else if (isCmdOrCtrl && e.key === "`") {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleSaveActiveFile, handleRunPreview]);

  // Command Palette Items
  const commandList: CommandItem[] = [
    {
      id: "cmd-save",
      title: "File: Save",
      category: "File",
      shortcut: "Ctrl+S",
      icon: <Save className="w-4 h-4 text-emerald-400" />,
      action: () => handleSaveActiveFile(),
    },
    {
      id: "cmd-new-file",
      title: "File: New File",
      category: "File",
      shortcut: "Alt+N",
      icon: <Plus className="w-4 h-4 text-cyan-400" />,
      action: () => {
        const name = prompt("Enter file name (e.g. component.tsx, styles.css):");
        if (name) handleCreateFile(name, false, null);
      },
    },
    {
      id: "cmd-run-preview",
      title: "View: Run Live Preview",
      category: "View",
      shortcut: "F5",
      icon: <Play className="w-4 h-4 text-emerald-400" />,
      action: () => handleRunPreview(),
    },
    {
      id: "cmd-ai-assistant",
      title: "AI: Toggle AI Coding Assistant",
      category: "AI",
      shortcut: "Ctrl+Shift+A",
      icon: <Sparkles className="w-4 h-4 text-purple-400" />,
      action: () => setIsAIOpen((prev) => !prev),
    },
    {
      id: "cmd-toggle-terminal",
      title: "View: Toggle Terminal Panel",
      category: "View",
      shortcut: "Ctrl+`",
      icon: <TerminalIcon className="w-4 h-4 text-amber-400" />,
      action: () => setIsTerminalOpen((prev) => !prev),
    },
    {
      id: "cmd-initialize-framework",
      title: "Project: Initialize Framework / Add Tooling",
      category: "Project",
      icon: <FolderCog className="w-4 h-4 text-amber-400" />,
      action: () => setIsInitializeDialogOpen(true),
    },
    {
      id: "cmd-export-json",
      title: "Project: Export as JSON",
      category: "Project",
      icon: <Download className="w-4 h-4 text-blue-400" />,
      action: () => {
        if (activeProject) exportProjectAsJSON(activeProject);
      },
    },
  ];

  // 1. Loading State
  if (isLoadingProject) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#181818] text-white font-sans gap-3 select-none">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        <span className="text-sm font-medium text-neutral-300">Loading project workspace...</span>
        <span className="text-xs text-neutral-500 font-mono">Connecting to cloud storage and filesystem</span>
      </div>
    );
  }

  // 2. Honest Error State (Never falls back to dummy project)
  if (projectLoadError || !activeProject) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#181818] text-white font-sans p-6 select-none">
        <div className="max-w-md w-full bg-[#252526] border border-[#3c3c3c] rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Project Not Found</h2>
            <p className="text-sm text-neutral-400 mt-1">
              {projectLoadError || "The requested workspace could not be found or you do not have permission to view it."}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-semibold transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Projects Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-neutral-300 font-sans overflow-hidden select-none">
      {/* Top Application Header Bar */}
      <header className="h-9 bg-[#1f1f1f] border-b border-[#2b2b2b] px-3 flex items-center justify-between text-xs select-none shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <Link
            href="/projects"
            className="flex items-center gap-1.5 text-neutral-400 hover:text-white px-2 py-0.5 rounded hover:bg-[#2b2b2b] transition font-medium"
            title="Return to Projects Dashboard"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Projects</span>
          </Link>
          <span className="text-neutral-600">/</span>
          <span className="font-semibold text-white tracking-tight flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
            Code Editor
          </span>
          <span className="text-neutral-500">/</span>
          <button
            type="button"
            onClick={() => setIsProjectModalOpen(true)}
            className="flex items-center gap-1.5 hover:text-white px-2 py-0.5 rounded hover:bg-[#2b2b2b] transition font-medium cursor-pointer"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-amber-400" />
            <span>{activeProject.name}</span>
            <span className="text-[10px] text-neutral-400 font-mono">({activeProject.template})</span>
          </button>
        </div>

        {/* Center Quick Open Pill */}
        <div className="flex-1 max-w-sm mx-4">
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="w-full flex items-center justify-between bg-[#141414] hover:bg-[#282828] border border-[#333333] px-3 py-1 rounded text-neutral-400 hover:text-neutral-200 transition text-xs font-mono cursor-pointer"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Search className="w-3 h-3 text-neutral-500" />
              <span className="truncate">
                {activeProject.name} / {activeFile ? activeFile.name : "Search files..."}
              </span>
            </span>
            <kbd className="text-[10px] bg-neutral-800 px-1.5 py-0.2 rounded text-neutral-400 border border-neutral-700">
              ⌘P
            </kbd>
          </button>
        </div>

        {/* Right Header Action Icons */}
        <div className="flex items-center gap-2">
          {/* Cloud Autosave Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#161616] border border-[#2b2b2b] text-[11px] font-mono">
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Cloud className="w-3 h-3 text-emerald-400" />
                <span>Saved</span>
              </span>
            )}
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-amber-300">
                <Loader2 className="w-3 h-3 animate-spin text-amber-300" />
                <span>Saving...</span>
              </span>
            )}
            {saveStatus === "unsaved" && (
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Unsaved</span>
              </span>
            )}
            {saveStatus === "error" && (
              <button
                type="button"
                onClick={handleSaveActiveFile}
                className="flex items-center gap-1 text-rose-400 hover:underline cursor-pointer"
                title="Click to retry saving"
              >
                <AlertCircle className="w-3 h-3 text-rose-400" />
                <span>Retry</span>
              </button>
            )}
          </div>

          {/* AI Agent Entry Point */}
          <button
            type="button"
            onClick={() => setIsAIOpen((prev) => !prev)}
            title={isAIOpen ? "Close AI Assistant" : "Open AI Assistant (Ctrl+Shift+A)"}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              isAIOpen
                ? "bg-[#382b5f] text-[#c4b5fd] ring-1 ring-[#a78bfa]/40 shadow-xs"
                : "text-neutral-300 hover:bg-[#2b2b2b] hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#a78bfa]" />
            <span className="hidden sm:inline">AI Agent</span>
          </button>

          {/* Run Preview Button */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleRunPreview}
            title={isPreviewOpen ? "Run / Refresh Preview (F5)" : "Run Preview (F5)"}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition cursor-pointer shadow-xs ${
              isPreviewOpen
                ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Run Preview</span>
          </button>
        </div>
      </header>

      {/* Main Body Layout: ActivityBar + Sidebar + Editor + SidePanels */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Far-left Activity Bar */}
        <ActivityBar
          activeView={activeSidebarView}
          onSelectView={(view) => {
            setActiveSidebarView((prev) => (prev === view ? null : view));
          }}
          theme={settings.theme}
          onToggleTheme={() => {
            const next = settings.theme === "vs-dark" ? "light" : "vs-dark";
            const updated = { ...settings, theme: next as "vs-dark" | "light" };
            setSettings(updated);
            saveEditorSettings(updated);
          }}
          onOpenProjectModal={() => setIsProjectModalOpen(true)}
        />

        {/* Primary Sidebar Panel (Explorer, Search, Settings) */}
        {activeSidebarView && (
          <aside className="w-64 bg-[#252526] border-r border-[#1e1e1e] flex flex-col shrink-0 z-20 overflow-hidden">
            {activeSidebarView === "explorer" && (
              <FileExplorer
                project={activeProject}
                activeFileId={activeProject.activeFileId}
                onSelectFile={handleSelectFile}
                onCreateFile={handleCreateFile}
                onRenameFile={handleRenameFile}
                onDeleteFile={handleDeleteFile}
                onRefresh={handleRefreshWorkspaceFiles}
                onResetProject={() => setIsInitializeDialogOpen(true)}
                onOpenInitializeProject={() => setIsInitializeDialogOpen(true)}
                onUploadFiles={handleUploadFiles}
              />
            )}

            {activeSidebarView === "search" && (
              <div className="flex-1 flex flex-col p-3 text-xs">
                <span className="font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Search in Workspace
                </span>
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search text in project files..."
                    className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded pl-8 pr-2.5 py-1.5 text-white outline-none focus:border-[var(--color-primary)] font-mono text-xs"
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {searchQuery.trim() === "" ? (
                    <div className="text-neutral-500 italic p-2">Type to search workspace files...</div>
                  ) : (
                    activeProject.files
                      .filter(
                        (f) =>
                          !f.isFolder &&
                          (f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            f.content.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                      .map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handleSelectFile(f.id)}
                          className="w-full text-left p-2 rounded hover:bg-[#2a2d2e] flex flex-col gap-0.5 transition cursor-pointer"
                        >
                          <span className="font-medium text-white flex items-center gap-1.5">
                            <FileCode className="w-3.5 h-3.5 text-blue-400" />
                            {f.path}
                          </span>
                        </button>
                      ))
                  )}
                </div>
              </div>
            )}

            {activeSidebarView === "git" && (
              <GitPanel
                project={activeProject}
                unsavedFiles={unsavedFiles}
                onSelectFile={handleSelectFile}
                onCommitSuccess={(msg) => {
                  setConsoleMessages((prev) => [
                    ...prev,
                    {
                      id: getEditorUniqueId("git"),
                      type: "info",
                      content: `✓ Git commit: ${msg}`,
                      timestamp: getTimestamp(),
                    },
                  ]);
                }}
              />
            )}

            {activeSidebarView === "debug" && (
              <DebugPanel
                project={activeProject}
                onExecuteCommand={() => {
                  setIsTerminalOpen(true);
                  setTerminalTab("terminal");
                }}
              />
            )}

            {activeSidebarView === "extensions" && <ExtensionsPanel />}

            {activeSidebarView === "settings" && (
              <div className="flex-1 p-3 text-xs space-y-4">
                <span className="font-semibold text-neutral-400 uppercase tracking-wider block">
                  Editor Settings
                </span>
                <div className="space-y-2">
                  <label className="text-neutral-300 block">Theme</label>
                  <select
                    value={settings.theme}
                    onChange={(e) => {
                      const updated = { ...settings, theme: e.target.value as "vs-dark" | "light" };
                      setSettings(updated);
                      saveEditorSettings(updated);
                    }}
                    className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded p-1.5 text-white outline-none"
                  >
                    <option value="vs-dark">Dark (VS Dark)</option>
                    <option value="light">Light</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-neutral-300 block">Font Size: {settings.fontSize}px</label>
                  <input
                    type="range"
                    min="10"
                    max="24"
                    value={settings.fontSize}
                    onChange={(e) => {
                      const updated = { ...settings, fontSize: Number(e.target.value) };
                      setSettings(updated);
                      saveEditorSettings(updated);
                    }}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-300 block">Font Family</label>
                  <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded p-2 text-neutral-300 font-mono text-[11px] select-text">
                    Consolas, &quot;Courier New&quot;, monospace
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-300 block">Line Height</label>
                  <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded p-2 text-neutral-300 font-mono text-[11px]">
                    1.5 ({Math.round(settings.fontSize * 1.5)}px)
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Central Editor Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
          {/* Top File Tabs Bar */}
          <EditorTabs
            openFiles={openFiles}
            activeFileId={activeProject.activeFileId}
            unsavedFiles={unsavedFiles}
            onSelectTab={handleSelectFile}
            onCloseTab={handleCloseTab}
          />

          {/* Monaco Editor Core Engine */}
          <div className="flex-1 overflow-hidden relative">
            <MonacoEditorComponent
              activeFile={activeFile}
              project={activeProject}
              settings={settings}
              onChange={handleContentChange}
              onSave={handleSaveActiveFile}
              onCursorChange={handleCursorChange}
            />
          </div>

          {/* Bottom Integrated Terminal & Console Panel */}
          <TerminalPanel
            isOpen={isTerminalOpen}
            onToggle={handleCloseTerminal}
            activeTab={terminalTab}
            onSelectTab={handleSelectTerminalTab}
            consoleMessages={consoleMessages}
            onClearConsole={handleClearConsole}
            project={activeProject}
            onFilesSynced={handleFilesSynced}
          />
        </main>

        {/* Right Side: Live Web Preview Panel */}
        {isPreviewOpen && activeProject && (
          <div className="w-1/2 lg:w-[45%] flex shrink-0 border-l border-[#2b2b2b]">
            <PreviewPanel
              project={activeProject}
              isOpen={isPreviewOpen}
              onClose={() => setIsPreviewOpen(false)}
              onConsoleMessage={handleConsoleMessage}
              refreshTrigger={previewRefreshKey}
            />
          </div>
        )}

        {/* Right Side: AI Coding Assistant Panel */}
        {isAIOpen && (
          <div className="w-80 md:w-96 flex shrink-0 border-l border-[#2b2b2b]">
            <AIAssistantPanel
              project={activeProject}
              activeFile={activeFile}
              isOpen={isAIOpen}
              onClose={() => setIsAIOpen(false)}
              onApplyDiff={handleApplyDiff}
            />
          </div>
        )}
      </div>

      {/* IDE Bottom Status Bar */}
      <StatusBar
        activeFile={activeFile}
        cursorPos={cursorPos}
        onToggleTerminal={handleToggleTerminal}
        isTerminalOpen={isTerminalOpen}
        saveStatus={saveStatus}
      />

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        project={activeProject}
        onSelectFile={handleSelectFile}
        commands={commandList}
      />

      {/* Project Switcher Modal */}
      {isProjectModalOpen && (
        <div
          onClick={() => setIsProjectModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl p-5 text-neutral-300 font-sans space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#333333]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-amber-400" />
                <span>Switch Cloud Project</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsProjectModalOpen(false)}
                className="p-1 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                Your Workspaces:
              </span>
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {projectsList.map((p) => (
                  <Link
                    key={p.id}
                    href={`/editor/${p.id}`}
                    onClick={() => setIsProjectModalOpen(false)}
                    className={`w-full p-2.5 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                      p.id === activeProject.id
                        ? "bg-[#1e1e1e] border-[var(--color-primary)] text-white"
                        : "bg-[#1e1e1e] hover:bg-[#2c2c2e] border-[#333333] text-neutral-300 hover:text-white"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-xs flex items-center gap-2">
                        <span>{p.name}</span>
                        {p.id === activeProject.id && (
                          <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-800">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                        {p.template} • {p.files?.length || 0} files
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#333333]">
              <Link
                href="/projects"
                onClick={() => setIsProjectModalOpen(false)}
                className="w-full p-2.5 rounded-lg bg-[#1e1e1e] hover:bg-[#2c2c2e] border border-[#333333] text-center text-xs font-semibold text-white transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Go to Cloud Projects Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Framework Initializer Dialog */}
      {isInitializeDialogOpen && activeProject && (
        <InitializeProjectDialog
          project={activeProject}
          isOpen={isInitializeDialogOpen}
          onClose={() => setIsInitializeDialogOpen(false)}
          onInitialized={(updatedProject: Project) => {
            setActiveProject(updatedProject);
            setIsInitializeDialogOpen(false);
            setConsoleMessages((prev) => [
              ...prev,
              {
                id: getEditorUniqueId("init"),
                type: "info",
                content: `✓ Framework tooling initialized: ${updatedProject.name}`,
                timestamp: getTimestamp(),
              },
            ]);
          }}
        />
      )}
    </div>
  );
}
