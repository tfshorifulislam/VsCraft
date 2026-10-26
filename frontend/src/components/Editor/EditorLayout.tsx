"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type MouseEvent,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import ActivityBar from "./ActivityBar";
import FileExplorer from "./FileExplorer";
import ResizableSidebar from "./ResizableSidebar";
import EditorGroupPane from "./EditorGroupPane";
import EditorSplitLayout from "./EditorSplitLayout";
import EditorTabContextMenu from "./EditorTabContextMenu";
import StatusBar from "./StatusBar";
import CommandPalette, { CommandItem } from "./CommandPalette";
import GitPanel from "./GitPanel";
import DebugPanel from "./DebugPanel";
import ExtensionsPanel from "./ExtensionsPanel";
import WorkspaceSearchPanel from "./WorkspaceSearchPanel";
import { cloudApi } from "@/lib/cloud/cloudApi";
import { webcontainerManager } from "@/lib/webcontainer/webcontainerManager";
import { fileContentCache } from "@/lib/cache/fileContentCache";
import {
  Project,
  ProjectFile,
  SidebarView,
  BottomTab,
  EditorSettings,
  ConsoleMessage,
  EditorGroupsState,
  EditorSplitDirection,
} from "@/types/editor";
import {
  closeEditorFileInGroup,
  closeEditorGroup,
  createEditorGroups,
  focusEditorGroup,
  getEditorGroup,
  isEditorFileOpenInGroup,
  moveEditorFileBetweenGroups,
  openEditorFileInGroup,
  removeEditorFiles,
  resizeEditorSplit,
  splitEditorGroup,
} from "@/lib/editor/editorGroups";
import {
  loadEditorSettings,
  saveEditorSettings,
  exportProjectAsJSON,
} from "@/lib/storage/projectStorage";
import {
  Search,
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
  Columns2,
  Rows2,
} from "lucide-react";

const TerminalPanel = dynamic(() => import("./TerminalPanel"), {
  ssr: false,
  loading: () => null,
});
const PreviewPanel = dynamic(() => import("./PreviewPanel"), {
  ssr: false,
  loading: () => null,
});
const AIAssistantPanel = dynamic(() => import("./AIAssistantPanel"), {
  ssr: false,
  loading: () => null,
});
const InitializeProjectDialog = dynamic(() => import("./InitializeProjectDialog"), {
  ssr: false,
  loading: () => null,
});

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
  const saveTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const persistedTabsRef = useRef<string | null>(null);
  const loadedFileIdsRef = useRef<Set<string>>(new Set());
  const inMemoryFileContentsRef = useRef<Map<string, string>>(new Map());
  const unsavedFilesRef = useRef<Record<string, boolean>>({});
  const activeProjectRef = useRef<Project | null>(null);
  const editorGroupsRef = useRef<EditorGroupsState | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");

  // 1. Core Cloud Project State
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(true);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [unsavedFiles, setUnsavedFiles] = useState<Record<string, boolean>>({});

  // 1b. Split editor groups
  const [editorGroups, setEditorGroups] = useState<EditorGroupsState | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    groupId: string;
    fileId: string | null;
    x: number;
    y: number;
  } | null>(null);

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
  const [hasOpenedTerminal, setHasOpenedTerminal] = useState(false);

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  useEffect(() => {
    editorGroupsRef.current = editorGroups;
  }, [editorGroups]);

  useEffect(() => {
    const saveTimeouts = saveTimeoutsRef.current;
    return () => {
      for (const timeout of saveTimeouts.values()) {
        clearTimeout(timeout);
      }
      saveTimeouts.clear();
    };
  }, []);

  // Fetch full cloud project when initialProjectId changes
  useEffect(() => {
    if (!initialProjectId) {
      router.push("/projects");
      return;
    }

    let isCancelled = false;
    persistedTabsRef.current = null;
    for (const timeout of saveTimeoutsRef.current.values()) {
      clearTimeout(timeout);
    }
    saveTimeoutsRef.current.clear();
    inMemoryFileContentsRef.current.clear();
    setUnsavedFiles({});
    setEditorGroups(null);
    setTabContextMenu(null);
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

        loadedFileIdsRef.current = new Set(
          cloudProj.loadedFileIds ||
            cloudProj.files.filter((file) => !file.isFolder).map((file) => file.id)
        );

        for (const file of cloudProj.files) {
          if (file.isFolder || !loadedFileIdsRef.current.has(file.id)) continue;
          fileContentCache.set(cloudProj.id, file.id, file.content, file.version);
        }

        let projectFiles = cloudProj.files;
        if (activeId && !loadedFileIdsRef.current.has(activeId)) {
          try {
            const activeFileVersion = cloudProj.files.find((file) => file.id === activeId)?.version;
            const loaded = await cloudApi.files.getContent(
              cloudProj.id,
              activeId,
              activeFileVersion
            );
            loadedFileIdsRef.current.add(activeId);
            projectFiles = projectFiles.map((file) =>
              file.id === activeId
                ? { ...file, content: loaded.content, version: loaded.version }
                : file
            );
          } catch (err) {
            console.error("Failed to load active file content:", err);
          }
        }

        setActiveProject({
          ...cloudProj,
          files: projectFiles,
          activeFileId: activeId,
          openFileIds: validOpenIds,
          loadedFileIds: [...loadedFileIdsRef.current],
        });
        setEditorGroups(createEditorGroups(validOpenIds, activeId));

        // Mount project into in-browser WebContainer runtime
        webcontainerManager.mountProject(cloudProj.id, projectFiles).catch((err) => {
          console.warn("[WebContainer] Background project mounting deferred or failed:", err);
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

  const filesById = useMemo(() => {
    const map = new Map<string, ProjectFile>();
    for (const file of activeProject?.files || []) map.set(file.id, file);
    return map;
  }, [activeProject?.files]);

  const resolveProjectFile = useCallback(
    (fileId: string | null | undefined): ProjectFile | null => {
      if (!fileId) return null;
      const file = filesById.get(fileId);
      if (!file || file.isFolder) return null;
      const buffered = inMemoryFileContentsRef.current.get(fileId);
      if (buffered !== undefined && buffered !== file.content) {
        return { ...file, content: buffered };
      }
      return file;
    },
    [filesById]
  );

  const activeGroup =
    editorGroups?.groups.find((group) => group.id === editorGroups.activeGroupId) ||
    editorGroups?.groups[0] ||
    null;
  const primaryGroup = editorGroups?.groups[0] || null;
  const activeGroupId = activeGroup?.id || null;
  const activeFile = resolveProjectFile(activeGroup?.activeFileId);

  // Persist the first group's tabs with the project so normal single-editor
  // sessions reopen exactly where the user left off.
  const tabsProjectId = activeProject?.id;
  const tabsActiveFileId = primaryGroup?.activeFileId ?? null;
  const tabsOpenFileIds = primaryGroup?.fileIds;

  useEffect(() => {
    if (!tabsProjectId || !tabsOpenFileIds) return;
    const key = `${tabsProjectId}:${tabsActiveFileId || ""}:${tabsOpenFileIds.join(",")}`;
    if (persistedTabsRef.current === null) {
      persistedTabsRef.current = key;
      return;
    }
    if (persistedTabsRef.current === key) return;
    persistedTabsRef.current = key;

    const openFileIds = [...tabsOpenFileIds];
    const timeout = setTimeout(() => {
      cloudApi.projects
        .update(tabsProjectId, { activeFileId: tabsActiveFileId ?? null, openFileIds })
        .catch((err) => console.error("Failed to persist editor tabs:", err));
    }, 400);

    return () => clearTimeout(timeout);
  }, [tabsProjectId, tabsActiveFileId, tabsOpenFileIds]);

  // Save implementation: writes to database and physical filesystem
  const performCloudSave = useCallback(
    async (fileId: string, content: string) => {
      const currentProject = activeProjectRef.current;
      if (!currentProject) return;
      setSaveStatus("saving");
      try {
        const currentVersion = currentProject.files.find((file) => file.id === fileId)?.version;
        const res = await cloudApi.files.saveContent(
          currentProject.id,
          fileId,
          content,
          currentVersion
        );
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
          loadedFileIdsRef.current.add(fileId);
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

        // Sync saved content to WebContainer virtual file system
        const targetFile = currentProject.files.find((f) => f.id === fileId);
        if (targetFile) {
          webcontainerManager.writeFile(targetFile.path, content).catch((err) => {
            console.warn("[WebContainer] Failed to write file:", err);
          });
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
    []
  );

  const clearSaveTimeout = useCallback((fileId: string) => {
    const timeout = saveTimeoutsRef.current.get(fileId);
    if (timeout) {
      clearTimeout(timeout);
      saveTimeoutsRef.current.delete(fileId);
    }
  }, []);

  const handleFileContentChange = useCallback(
    (fileId: string, newContent: string) => {
      const project = activeProjectRef.current;
      if (!project?.files.some((file) => file.id === fileId && !file.isFolder)) return;

      inMemoryFileContentsRef.current.set(fileId, newContent);
      setSaveStatus("unsaved");
      setUnsavedFiles((prev) => (prev[fileId] ? prev : { ...prev, [fileId]: true }));

      clearSaveTimeout(fileId);
      const timeout = setTimeout(() => {
        saveTimeoutsRef.current.delete(fileId);
        const latest = inMemoryFileContentsRef.current.get(fileId) ?? newContent;
        performCloudSave(fileId, latest);
      }, 1000);
      saveTimeoutsRef.current.set(fileId, timeout);
    },
    [clearSaveTimeout, performCloudSave]
  );

  const handleSaveFile = useCallback(
    (fileId: string) => {
      const project = activeProjectRef.current;
      const file = project?.files.find((candidate) => candidate.id === fileId);
      if (!project || !file || file.isFolder) return;

      clearSaveTimeout(fileId);
      const latest = inMemoryFileContentsRef.current.get(fileId) ?? file.content;
      performCloudSave(fileId, latest);
      setConsoleMessages((prev) => [
        ...prev,
        {
          id: getEditorUniqueId("c"),
          type: "info",
          content: `Saved ${file.path}`,
          timestamp: getTimestamp(),
        },
      ]);
    },
    [clearSaveTimeout, performCloudSave]
  );

  const handleSaveActiveFile = useCallback(() => {
    if (!activeFile) return;
    handleSaveFile(activeFile.id);
  }, [activeFile, handleSaveFile]);

  const handleSelectFile = useCallback(
    async (fileId: string, targetGroupId?: string) => {
      const project = activeProjectRef.current;
      const groups = editorGroupsRef.current;
      if (!project || !groups) return;

      const file = project.files.find((candidate) => candidate.id === fileId);
      if (!file || file.isFolder) return;

      const groupId = targetGroupId || groups.activeGroupId;
      const group = getEditorGroup(groups, groupId);
      if (!group) return;

      if (!loadedFileIdsRef.current.has(fileId)) {
        try {
          const loaded = await cloudApi.files.getContent(project.id, fileId, file.version);
          if (activeProjectRef.current?.id !== project.id) return;
          loadedFileIdsRef.current.add(fileId);
          setActiveProject((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              files: prev.files.map((candidate) =>
                candidate.id === fileId
                  ? {
                      ...candidate,
                      content: loaded.content,
                      version: loaded.version,
                    }
                  : candidate
              ),
              loadedFileIds: prev.loadedFileIds
                ? [...new Set([...prev.loadedFileIds, fileId])]
                : prev.loadedFileIds,
            };
          });
        } catch (err) {
          setConsoleMessages((prev) => [
            ...prev,
            {
              id: getEditorUniqueId("err"),
              type: "error",
              content: `Failed to open file: ${err instanceof Error ? err.message : "Network error"}`,
              timestamp: getTimestamp(),
            },
          ]);
          return;
        }
      }

      if (group.activeFileId && unsavedFilesRef.current[group.activeFileId]) {
        handleSaveFile(group.activeFileId);
      }

      setEditorGroups((prev) =>
        prev ? openEditorFileInGroup(prev, groupId, fileId) : prev
      );
    },
    [handleSaveFile]
  );

  const closeTabInGroup = useCallback(
    (groupId: string, fileId: string) => {
      const project = activeProjectRef.current;
      const groups = editorGroupsRef.current;
      if (!project || !groups) return;

      const group = getEditorGroup(groups, groupId);
      if (!group || !group.fileIds.includes(fileId)) return;

      const isOpenElsewhere = isEditorFileOpenInGroup(groups.groups, fileId, groupId);
      const closingFile = project.files.find((file) => file.id === fileId);
      clearSaveTimeout(fileId);

      if (!isOpenElsewhere) {
        if (unsavedFilesRef.current[fileId] && closingFile) {
          const latest = inMemoryFileContentsRef.current.get(fileId) ?? closingFile.content;
          performCloudSave(fileId, latest);
        } else if (closingFile) {
          fileContentCache.set(project.id, fileId, closingFile.content, closingFile.version);
          loadedFileIdsRef.current.delete(fileId);
        }

        inMemoryFileContentsRef.current.delete(fileId);
        setUnsavedFiles((prev) => {
          if (!prev[fileId]) return prev;
          const copy = { ...prev };
          delete copy[fileId];
          return copy;
        });
      }

      setEditorGroups((prev) =>
        prev ? closeEditorFileInGroup(prev, groupId, fileId) : prev
      );
    },
    [clearSaveTimeout, performCloudSave]
  );

  const handleCloseTab = (groupId: string, fileId: string, e: MouseEvent) => {
    e.stopPropagation();
    closeTabInGroup(groupId, fileId);
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
        if (!serverFile.isFolder) {
          loadedFileIdsRef.current.add(serverFile.id);
          fileContentCache.set(
            activeProject.id,
            serverFile.id,
            serverFile.content,
            serverFile.version
          );
        }
        setActiveProject((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            files: [...prev.files, serverFile],
            loadedFileIds:
              isFolder || !prev.loadedFileIds
                ? prev.loadedFileIds
                : [...new Set([...prev.loadedFileIds, serverFile.id])],
            updatedAt: getTimestamp(),
          };
        });
        if (!isFolder) {
          setEditorGroups((prev) =>
            prev ? openEditorFileInGroup(prev, prev.activeGroupId, serverFile.id) : prev
          );
          webcontainerManager.writeFile(serverFile.path, serverFile.content).catch((err) => {
            console.warn("[WebContainer] Failed to sync new file:", err);
          });
        }
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
      const oldFile = activeProject.files.find((f) => f.id === fileId);
      const updated = await cloudApi.files.rename(activeProject.id, fileId, newName);
      if (updated) {
        if (oldFile && !oldFile.isFolder) {
          webcontainerManager.renameFile(oldFile.path, updated.path).catch((err) => {
            console.warn("[WebContainer] Failed to rename file:", err);
          });
        }
        setActiveProject((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            files: prev.files.map((f) =>
              f.id === fileId ? { ...f, ...updated, content: f.content } : f
            ),
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
      const fileToDelete = activeProject.files.find((f) => f.id === fileId);
      await cloudApi.files.delete(activeProject.id, fileId);
      if (fileToDelete) {
        webcontainerManager.removeFile(fileToDelete.path).catch((err) => {
          console.warn("[WebContainer] Failed to delete file:", err);
        });
      }

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

      for (const id of toDeleteIds) {
        fileContentCache.delete(activeProject.id, id);
        loadedFileIdsRef.current.delete(id);
        clearSaveTimeout(id);
        inMemoryFileContentsRef.current.delete(id);
      }
      setUnsavedFiles((prev) => {
        const next = { ...prev };
        for (const id of toDeleteIds) delete next[id];
        return next;
      });

      setActiveProject((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          files: prev.files.filter((f) => !toDeleteIds.has(f.id)),
          loadedFileIds: prev.loadedFileIds?.filter((id) => !toDeleteIds.has(id)),
          updatedAt: getTimestamp(),
        };
      });
      setEditorGroups((prev) => (prev ? removeEditorFiles(prev, toDeleteIds) : prev));
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
        for (const uploaded of uploadedFiles) {
          if (uploaded.isFolder) continue;
          loadedFileIdsRef.current.add(uploaded.id);
          fileContentCache.set(
            activeProject.id,
            uploaded.id,
            uploaded.content,
            uploaded.version
          );
          webcontainerManager.writeFile(uploaded.path, uploaded.content).catch(() => {});
        }
        setActiveProject((prev) => {
          if (!prev) return null;
          const map = new Map<string, ProjectFile>();
          for (const f of prev.files) map.set(f.path, f);
          for (const u of uploadedFiles) map.set(u.path, u);
          const nextFiles = Array.from(map.values());

          const uploadedIds = uploadedFiles
            .filter((file) => !file.isFolder)
            .map((file) => file.id);
          return {
            ...prev,
            files: nextFiles,
            loadedFileIds: prev.loadedFileIds
              ? [...new Set([...prev.loadedFileIds, ...uploadedIds])]
              : prev.loadedFileIds,
            updatedAt: getTimestamp(),
          };
        });

        const firstUploadedFile = uploadedFiles.find((file) => !file.isFolder);
        if (firstUploadedFile) {
          setEditorGroups((prev) =>
            prev
              ? openEditorFileInGroup(prev, prev.activeGroupId, firstUploadedFile.id)
              : prev
          );
        }

        setConsoleMessages((prev) => [
          ...prev,
          {
            id: getEditorUniqueId("up_done"),
            type: "info",
            content: `âœ“ Successfully uploaded ${uploadedFiles.length} file(s) to cloud workspace.`,
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
        content: `âœ“ AI Diff applied and saved to ${targetFile.path}`,
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

  useEffect(() => {
    unsavedFilesRef.current = unsavedFiles;
  }, [unsavedFiles]);

  const handleFocusGroup = useCallback((groupId: string) => {
    setEditorGroups((prev) => (prev ? focusEditorGroup(prev, groupId) : prev));
  }, []);

  const handleCursorChange = useCallback((groupId: string, line: number, column: number) => {
    if (groupId === editorGroupsRef.current?.activeGroupId) {
      setCursorPos({ line, column });
    }
  }, []);

  const handleSplitGroup = useCallback(
    (groupId: string, direction: EditorSplitDirection) => {
      setTabContextMenu(null);
      setEditorGroups((prev) =>
        prev ? splitEditorGroup(prev, groupId, direction) : prev
      );
    },
    []
  );

  const handleCloseGroup = useCallback(
    (groupId: string) => {
      const project = activeProjectRef.current;
      const groups = editorGroupsRef.current;
      if (!project || !groups || groups.groups.length <= 1) return;

      const group = getEditorGroup(groups, groupId);
      if (!group) return;

      const remainingGroups = groups.groups.filter((candidate) => candidate.id !== groupId);
      const remainingFileIds = new Set(remainingGroups.flatMap((candidate) => candidate.fileIds));

      for (const fileId of group.fileIds) {
        if (remainingFileIds.has(fileId)) continue;
        clearSaveTimeout(fileId);
        const file = project.files.find((candidate) => candidate.id === fileId);
        if (file && unsavedFilesRef.current[fileId]) {
          const latest = inMemoryFileContentsRef.current.get(fileId) ?? file.content;
          performCloudSave(fileId, latest);
        } else if (file) {
          fileContentCache.set(project.id, fileId, file.content, file.version);
          loadedFileIdsRef.current.delete(fileId);
        }
        inMemoryFileContentsRef.current.delete(fileId);
      }

      setUnsavedFiles((prev) => {
        const next = { ...prev };
        for (const fileId of group.fileIds) {
          if (!remainingFileIds.has(fileId)) delete next[fileId];
        }
        return next;
      });
      setTabContextMenu(null);
      setEditorGroups((prev) => (prev ? closeEditorGroup(prev, groupId) : prev));
    },
    [clearSaveTimeout, performCloudSave]
  );

  const handleMoveTab = useCallback(
    (sourceGroupId: string, fileId: string, targetGroupId: string) => {
      setEditorGroups((prev) =>
        prev
          ? moveEditorFileBetweenGroups(prev, sourceGroupId, targetGroupId, fileId)
          : prev
      );
    },
    []
  );

  const handleResizeEditorSplit = useCallback((splitId: string, ratio: number) => {
    setEditorGroups((prev) => (prev ? resizeEditorSplit(prev, splitId, ratio) : prev));
  }, []);

  const handleTabContextMenu = useCallback(
    (groupId: string, fileId: string | null, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setEditorGroups((prev) => (prev ? focusEditorGroup(prev, groupId) : prev));
      setTabContextMenu({
        groupId,
        fileId,
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const closeTabContextMenu = useCallback(() => setTabContextMenu(null), []);

  const handleClearConsole = useCallback(() => {
    setConsoleMessages([]);
  }, []);

  const handleToggleTerminal = useCallback(() => {
    setHasOpenedTerminal(true);
    setIsTerminalOpen((prev) => !prev);
  }, []);

  const handleCloseTerminal = useCallback(() => {
    setIsTerminalOpen(false);
  }, []);

  const handleSelectTerminalTab = useCallback((tab: BottomTab) => {
    setTerminalTab(tab);
  }, []);

  const handleFilesSynced = useCallback((updatedFiles: ProjectFile[]) => {
    const projectId = activeProject?.id;
    for (const file of updatedFiles) {
      if (file.isFolder) continue;
      loadedFileIdsRef.current.add(file.id);
      if (projectId) {
        fileContentCache.set(projectId, file.id, file.content, file.version);
      }
    }
    setActiveProject((prev) => {
      if (!prev) return null;
      // Do not overwrite any file that has pending in-memory edits.
      const merged = updatedFiles.map((newFile) => {
        if (inMemoryFileContentsRef.current.has(newFile.id)) {
          return { ...newFile, content: inMemoryFileContentsRef.current.get(newFile.id)! };
        }
        return newFile;
      });
      const syncedIds = updatedFiles.filter((file) => !file.isFolder).map((file) => file.id);
      return {
        ...prev,
        files: merged,
        loadedFileIds: prev.loadedFileIds
          ? [...new Set([...prev.loadedFileIds, ...syncedIds])]
          : prev.loadedFileIds,
        updatedAt: getTimestamp(),
      };
    });
  }, [activeProject?.id]);

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
        content: "â–¶ Run Preview: Triggered application refresh...",
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
      } else if (isCmdOrCtrl && e.code === "Backslash" && e.shiftKey) {
        e.preventDefault();
        const groupId = editorGroupsRef.current?.activeGroupId;
        if (groupId) handleSplitGroup(groupId, "down");
      } else if (isCmdOrCtrl && e.code === "Backslash") {
        e.preventDefault();
        const groupId = editorGroupsRef.current?.activeGroupId;
        if (groupId) handleSplitGroup(groupId, "right");
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
        handleToggleTerminal();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    handleSaveActiveFile,
    handleRunPreview,
    handleToggleTerminal,
    handleSplitGroup,
  ]);

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
      id: "cmd-split-right",
      title: "View: Split Editor Right",
      category: "View",
      shortcut: "Ctrl+\\",
      icon: <Columns2 className="w-4 h-4 text-sky-400" />,
      action: () => {
        if (activeGroupId) handleSplitGroup(activeGroupId, "right");
      },
    },
    {
      id: "cmd-split-down",
      title: "View: Split Editor Down",
      category: "View",
      shortcut: "Ctrl+Shift+\\",
      icon: <Rows2 className="w-4 h-4 text-sky-400" />,
      action: () => {
        if (activeGroupId) handleSplitGroup(activeGroupId, "down");
      },
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
      action: handleToggleTerminal,
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

  if (!editorGroups) return null;

  const renderEditorGroup = (groupId: string) => {
    const group = getEditorGroup(editorGroups, groupId);
    if (!group) return null;

    const groupOpenFiles = group.fileIds
      .map((id) => filesById.get(id))
      .filter((file): file is ProjectFile => !!file && !file.isFolder);
    const groupActiveFile = resolveProjectFile(group.activeFileId);

    return (
      <EditorGroupPane
        key={group.id}
        groupId={group.id}
        openFiles={groupOpenFiles}
        activeFile={groupActiveFile}
        project={activeProject}
        settings={settings}
        unsavedFiles={unsavedFiles}
        focused={group.id === editorGroups.activeGroupId}
        canCloseGroup={editorGroups.groups.length > 1}
        onFocus={handleFocusGroup}
        onSelectTab={(groupId, fileId) => handleSelectFile(fileId, groupId)}
        onCloseTab={handleCloseTab}
        onTabContextMenu={handleTabContextMenu}
        onMoveTab={handleMoveTab}
        onSplit={handleSplitGroup}
        onCloseGroup={handleCloseGroup}
        onChange={handleFileContentChange}
        onSave={handleSaveFile}
        onCursorChange={handleCursorChange}
      />
    );
  };

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
              âŒ˜P
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

          {/* Editor Group Actions */}
          <div className="hidden sm:flex items-center gap-0.5 rounded border border-[#2b2b2b] bg-[#161616] p-0.5">
            <button
              type="button"
              data-action="header-split-right"
              onClick={() => {
                if (activeGroupId) handleSplitGroup(activeGroupId, "right");
              }}
              title="Split Editor Right (Ctrl+\\)"
              aria-label="Split editor right"
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-[#2b2b2b] hover:text-white"
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-action="header-split-down"
              onClick={() => {
                if (activeGroupId) handleSplitGroup(activeGroupId, "down");
              }}
              title="Split Editor Down (Ctrl+Shift+\\)"
              aria-label="Split editor down"
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-[#2b2b2b] hover:text-white"
            >
              <Rows2 className="w-3.5 h-3.5" />
            </button>
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
          <ResizableSidebar>
            {activeSidebarView === "explorer" && (
              <FileExplorer
                project={activeProject}
                activeFileId={activeGroup?.activeFileId ?? null}
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
              <WorkspaceSearchPanel project={activeProject} onSelectFile={handleSelectFile} />
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
                      content: `âœ“ Git commit: ${msg}`,
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
                  setHasOpenedTerminal(true);
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
          </ResizableSidebar>
        )}

        {/* Central Editor Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e] min-w-0">
          {/* Split Editor Groups */}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <EditorSplitLayout
              node={editorGroups.layout}
              renderGroup={renderEditorGroup}
              onResize={handleResizeEditorSplit}
            />
          </div>

          {/* Bottom Integrated Terminal & Console Panel */}
          {(isTerminalOpen || hasOpenedTerminal) && (
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
          )}
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

      {/* Editor Tab Context Menu */}
      {tabContextMenu && (
        <EditorTabContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          groupId={tabContextMenu.groupId}
          fileId={tabContextMenu.fileId}
          canCloseGroup={editorGroups.groups.length > 1}
          onSplit={handleSplitGroup}
          onCloseGroup={handleCloseGroup}
          onCloseTab={closeTabInGroup}
          onClose={closeTabContextMenu}
        />
      )}

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
                        {p.template} â€¢ {p.files?.length || 0} files
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
                content: `âœ“ Framework tooling initialized: ${updatedProject.name}`,
                timestamp: getTimestamp(),
              },
            ]);
          }}
        />
      )}
    </div>
  );
}
