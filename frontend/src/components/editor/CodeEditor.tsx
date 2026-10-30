"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FileCode2,
  Loader2,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { buildFileTree, type ProjectFile, type TreeNode } from "@/lib/fileTree";
import { languageForPath } from "@/lib/language";
import FileTree from "./FileTree";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[#8a8a8a]">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading editor…
    </div>
  ),
});

type SaveState = "idle" | "saving" | "saved" | "error";

interface CodeEditorProps {
  projectId: string;
}

export default function CodeEditor({ projectId }: CodeEditorProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);
  const persistRef = useRef<(fileId: string, value: string) => Promise<void>>(
    async () => undefined
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const persist = useCallback(async (fileId: string, value: string) => {
    setSaveState("saving");
    try {
      const data = await apiFetch<{ file: ProjectFile }>(`/api/files/${fileId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: value }),
      });
      setFiles((previous) =>
        previous.map((file) =>
          file.id === fileId
            ? { ...file, content: value, updatedAt: data.file.updatedAt }
            : file
        )
      );
      if (activeIdRef.current === fileId) {
        setDirty(false);
        dirtyRef.current = false;
      }
      setSaveState("saved");
    } catch (saveError) {
      setSaveState("error");
      setError(
        saveError instanceof Error ? saveError.message : "Could not save file."
      );
    }
  }, []);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const load = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const data = await apiFetch<{ project: { files: ProjectFile[] } }>(
        `/api/projects/${projectId}`
      );
      const nextFiles = data.project.files;
      setFiles(nextFiles);

      const current = activeIdRef.current;
      const nextId =
        current && nextFiles.some((file) => file.id === current)
          ? current
          : nextFiles[0]?.id ?? null;
      const nextFile = nextFiles.find((file) => file.id === nextId) || null;

      setActiveId(nextId);
      activeIdRef.current = nextId;
      setContent(nextFile?.content ?? "");
      contentRef.current = nextFile?.content ?? "";
      setDirty(false);
      dirtyRef.current = false;
      setSaveState("idle");
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load files."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current && activeIdRef.current) {
        fetch(`/api/files/${activeIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentRef.current }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, []);

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeId) || null,
    [files, activeId]
  );
  const tree = useMemo(() => buildFileTree(files), [files]);

  const handleChange = (value: string | undefined) => {
    const nextValue = value ?? "";
    setContent(nextValue);
    contentRef.current = nextValue;
    setDirty(true);
    dirtyRef.current = true;
    setSaveState("idle");

    if (timerRef.current) clearTimeout(timerRef.current);
    const fileId = activeIdRef.current;
    if (!fileId) return;
    timerRef.current = setTimeout(() => {
      void persistRef.current(fileId, nextValue);
    }, 800);
  };

  const saveNow = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const fileId = activeIdRef.current;
    if (fileId) void persistRef.current(fileId, contentRef.current);
  };

  const selectFile = (node: TreeNode) => {
    if (node.type !== "file" || !node.file) return;
    if (activeIdRef.current && dirtyRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      void persistRef.current(activeIdRef.current, contentRef.current);
    }
    setActiveId(node.file.id);
    activeIdRef.current = node.file.id;
    setContent(node.file.content);
    contentRef.current = node.file.content;
    setDirty(false);
    dirtyRef.current = false;
    setSaveState("idle");
  };

  return (
    <div className="flex h-full bg-[#1e1e1e] text-white">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[#2d2d2d] bg-[#252526]">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">
            Explorer
          </span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              void load();
            }}
            title="Refresh from database"
            className="rounded p-1 text-[#8a8a8a] transition hover:bg-[#37373d] hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {tree.length === 0 ? (
            <p className="px-3 py-4 text-xs leading-relaxed text-[#8a8a8a]">
              No files yet. Use the terminal to scaffold a project, then press
              refresh.
            </p>
          ) : (
            <FileTree
              nodes={tree}
              selectedPath={activeFile?.path ?? null}
              onSelect={selectFile}
            />
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] bg-[#252526] px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode2 className="h-4 w-4 shrink-0 text-[#519aba]" />
            <span className="truncate text-xs text-[#cccccc]">
              {activeFile ? activeFile.path : "No file selected"}
            </span>
            {dirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0d99ff]" />
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a]">
              {saveState === "saving" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </>
              )}
              {saveState === "saved" && (
                <>
                  <Check className="h-3 w-3 text-emerald-400" /> Saved to database
                </>
              )}
              {saveState === "error" && (
                <>
                  <TriangleAlert className="h-3 w-3 text-red-400" /> Save failed
                </>
              )}
              {saveState === "idle" && dirty && "Unsaved changes"}
              {saveState === "idle" && !dirty && activeFile && "Autosave on"}
            </span>
            <button
              type="button"
              onClick={saveNow}
              disabled={!activeFile}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0d99ff] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#0b87e3] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-[#8a8a8a]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading files from database…
            </div>
          ) : activeFile ? (
            <MonacoEditor
              key={activeFile.id}
              path={activeFile.path}
              language={languageForPath(activeFile.path)}
              value={content}
              onChange={handleChange}
              onMount={(editor: any, monaco: any) => {
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                  () => saveNow()
                );
              }}
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily:
                  '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
                minimap: { enabled: true },
                wordWrap: "on",
                tabSize: 2,
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                automaticLayout: true,
                padding: { top: 12 },
                renderLineHighlight: "all",
                cursorBlinking: "smooth",
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <FileCode2 className="h-10 w-10 text-[#3c3c3c]" />
              <p className="text-sm text-[#cccccc]">No file selected</p>
              <p className="max-w-xs text-xs text-[#8a8a8a]">
                Create files in the terminal, then refresh the explorer to open
                them here.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
