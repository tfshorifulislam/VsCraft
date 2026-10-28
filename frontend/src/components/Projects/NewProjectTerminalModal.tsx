"use client";

import React, { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  webcontainerManager,
  type ExportedVirtualFile,
  type WebContainerShellHandle,
} from "@/lib/webcontainer/webcontainerManager";
import { cloudApi } from "@/lib/cloud/cloudApi";
import { ExternalLink, Loader2, RotateCcw, Terminal as TerminalIcon } from "lucide-react";
import { useRouter } from "next/navigation";

interface NewProjectTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TerminalStatus = "idle" | "booting" | "starting" | "ready" | "error";

const MIN_WIDTH = 520;
const MIN_HEIGHT = 320;
const HEADER_HEIGHT = 40;

const TERMINAL_THEME = {
  background: "#0b0f14",
  foreground: "#e6edf3",
  cursor: "#2dd4bf",
  cursorAccent: "#0b0f14",
  selectionBackground: "#264f78",
  black: "#0b0f14",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

function deriveProjectName(files: ExportedVirtualFile[]): string {
  const pkg = files.find(
    (file) => !file.isFolder && (file.path === "package.json" || file.path.endsWith("/package.json"))
  );
  if (pkg?.content) {
    try {
      const parsed = JSON.parse(pkg.content);
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        return parsed.name.trim();
      }
    } catch {}
  }

  const rootFolder = files.find((file) => file.isFolder && !file.path.includes("/"));
  if (rootFolder) return rootFolder.name;

  return "WebContainer Project";
}

export default function NewProjectTerminalModal({
  isOpen,
  onClose,
}: NewProjectTerminalModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const shellRef = useRef<WebContainerShellHandle | null>(null);
  const closingTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null);
  const router = useRouter();

  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasWorkspaceFiles, setHasWorkspaceFiles] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState({ width: 920, height: 560 });

  const fitTerminal = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    try {
      fit.fit();
    } catch {
      return;
    }
    try {
      shellRef.current?.resize(term.cols, term.rows);
    } catch {}
  }, []);

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    if (closingTimerRef.current !== null) window.clearTimeout(closingTimerRef.current);
    closingTimerRef.current = window.setTimeout(() => {
      closingTimerRef.current = null;
      onClose();
    }, 180);
  }, [isClosing, onClose]);

  const redirectToEditor = useCallback(
    (projectId: string) => {
      setIsClosing(true);
      if (closingTimerRef.current !== null) window.clearTimeout(closingTimerRef.current);
      closingTimerRef.current = window.setTimeout(() => {
        closingTimerRef.current = null;
        onClose();
        router.push(`/editor/${projectId}`);
      }, 180);
    },
    [onClose, router]
  );

  useEffect(() => {
    return () => {
      if (closingTimerRef.current !== null) window.clearTimeout(closingTimerRef.current);
    };
  }, []);

  const handleOpenInEditor = useCallback(async () => {
    if (!hasWorkspaceFiles || isSaving || isClosing) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const files = await webcontainerManager.exportProjectFiles();
      const name = deriveProjectName(files);
      const hasContentFiles = files.some((file) => !file.isFolder);

      let projectId: string;

      if (hasContentFiles) {
        const { project } = await cloudApi.projects.importFiles({
          name,
          description: "Created from the VsCraft WebContainer terminal",
          files: files.map((file) => ({
            path: file.path,
            name: file.name,
            content: file.content,
            isFolder: file.isFolder,
          })),
        });
        projectId = project.id;
      } else {
        const project = await cloudApi.projects.create({
          type: "blank",
          blankSubtype: "empty",
          name,
          description: "Created from the VsCraft WebContainer terminal",
        });
        if (files.length > 0) {
          await cloudApi.projects.sync(project.id, files);
        }
        projectId = project.id;
      }

      redirectToEditor(projectId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save the project.");
      setIsSaving(false);
    }
  }, [hasWorkspaceFiles, isSaving, isClosing, redirectToEditor]);

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    if (closingTimerRef.current !== null) {
      window.clearTimeout(closingTimerRef.current);
      closingTimerRef.current = null;
    }
    setIsClosing(false);
    setIsSaving(false);
    setSaveError(null);
    setHasWorkspaceFiles(false);
    setWorkspaceReady(false);
    setStatus("booting");
    setError(null);
    setIsMinimized(false);

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      letterSpacing: 0,
      scrollback: 10000,
      allowProposedApi: true,
      theme: TERMINAL_THEME,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    try {
      term.loadAddon(new WebLinksAddon());
    } catch {}

    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    term.writeln("\x1b[1;32mVsCraft Cloud Terminal\x1b[0m");
    term.writeln("\x1b[38;5;244mWebContainers sandbox — runs entirely in your browser\x1b[0m");
    term.writeln("\x1b[38;5;244mTry: npm init -y, npx create-vite@latest app, npm install, npm run dev\x1b[0m\r\n");

    const frame = requestAnimationFrame(() => fitTerminal());

    const observer = new ResizeObserver(() => {
      if (!cancelled) fitTerminal();
    });
    observer.observe(container);

    const dataDisposable = term.onData((data) => {
      const shell = shellRef.current;
      if (!shell) return;
      void shell.write(data).catch(() => {});
    });

    const boot = async () => {
      try {
        if (!webcontainerManager.isSupported()) {
          throw new Error(
            "Cross-origin isolation is not enabled. WebContainers require COOP: same-origin and COEP: require-corp."
          );
        }

        await webcontainerManager.getInstance();
        if (cancelled) return;

        await webcontainerManager.resetWorkspace();
        if (cancelled) return;

        setWorkspaceReady(true);
        setStatus("starting");

        const shell = await webcontainerManager.spawnShell({
          cols: Math.max(term.cols || 80, 80),
          rows: Math.max(term.rows || 24, 24),
          onData: (data) => {
            if (!cancelled) term.write(data);
          },
        });

        if (cancelled) {
          shell.kill();
          return;
        }

        shellRef.current = shell;
        setStatus("ready");
        fitTerminal();
        term.focus();

        void shell.exit.then((exitCode) => {
          if (cancelled) return;
          term.write(`\r\n\x1b[33m[shell exited with code ${exitCode}]\x1b[0m\r\n`);
          setStatus("idle");
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to boot WebContainer.");
        setStatus("error");
      }
    };

    void boot();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      dataDisposable.dispose();
      observer.disconnect();

      const shell = shellRef.current;
      shellRef.current = null;
      if (shell) {
        try {
          shell.kill();
        } catch {}
      }

      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [isOpen, attempt, fitTerminal]);

  useEffect(() => {
    if (!isOpen || !workspaceReady) return;
    if (!webcontainerManager.isSupported()) {
      return;
    }

    let active = true;
    let timer: number | null = null;

    const check = async () => {
      const detected = await webcontainerManager.hasWorkspaceFiles();
      if (!active) return;
      setHasWorkspaceFiles(detected);
      timer = window.setTimeout(check, 1200);
    };

    void check();

    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isOpen, attempt, workspaceReady]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => fitTerminal(), 60);
    return () => window.clearTimeout(timer);
  }, [isOpen, isMaximized, isMinimized, size.width, size.height, fitTerminal]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, requestClose]);

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isMaximized) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      width: size.width,
      height: size.height,
    };
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 32);
    const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 32);
    const width = Math.min(maxWidth, Math.max(MIN_WIDTH, drag.width + (event.clientX - drag.startX)));
    const height = Math.min(maxHeight, Math.max(MIN_HEIGHT, drag.height + (event.clientY - drag.startY)));
    setSize({ width, height });
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!isOpen) return null;

  const windowHeight = isMaximized ? "100%" : isMinimized ? HEADER_HEIGHT : size.height;
  const windowWidth = isMaximized ? "100%" : size.width;

  const statusLabel =
    status === "ready"
      ? "jsh"
      : status === "error"
        ? "offline"
        : status === "idle"
          ? "idle"
          : "booting";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm transition-opacity duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        className={`relative flex flex-col overflow-hidden border border-[#30363d] bg-[#0b0f14] shadow-2xl shadow-black/60 transition-all duration-200 ease-out ${
          isMaximized ? "rounded-none" : "rounded-xl"
        } ${isClosing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100"}`}
        style={{
          width: windowWidth,
          height: windowHeight,
          maxWidth: "100%",
          maxHeight: "100%",
          minWidth: isMaximized ? undefined : MIN_WIDTH,
          minHeight: isMinimized ? HEADER_HEIGHT : undefined,
        }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#21262d] bg-[#161b22] px-3 select-none">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Close terminal"
              onClick={requestClose}
              className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#ff5f57] transition hover:brightness-110"
            >
              <span className="text-[8px] font-bold text-[#4c0000] opacity-0 transition group-hover:opacity-100">
                ×
              </span>
            </button>
            <button
              type="button"
              aria-label="Minimize terminal"
              onClick={() => setIsMinimized((value) => !value)}
              className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#febc2e] transition hover:brightness-110"
            >
              <span className="text-[8px] font-bold text-[#5a3a00] opacity-0 transition group-hover:opacity-100">
                −
              </span>
            </button>
            <button
              type="button"
              aria-label="Maximize terminal"
              onClick={() => setIsMaximized((value) => !value)}
              className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#28c840] transition hover:brightness-110"
            >
              <span className="text-[8px] font-bold text-[#003a00] opacity-0 transition group-hover:opacity-100">
                +
              </span>
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-neutral-400">
            <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">New Project — WebContainer</span>
          </div>

          <div className="flex w-[52px] justify-end">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                status === "ready"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : status === "error"
                    ? "bg-rose-500/10 text-rose-400"
                    : "bg-neutral-700/40 text-neutral-400"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div
          className="relative min-h-0 flex-1 flex-col bg-[#0b0f14]"
          style={{ display: isMinimized ? "none" : "flex" }}
        >
          <div ref={containerRef} className="h-full w-full px-2 pb-1 pt-1" />

          {(status === "booting" || status === "starting") && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0b0f14]/70">
              <div className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-neutral-300 shadow-lg">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span>
                  {status === "booting"
                    ? "Booting WebContainer sandbox…"
                    : "Starting cloud jsh shell…"}
                </span>
              </div>
            </div>
          )}

          {status === "error" && error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f14]/85 p-6">
              <div className="w-full max-w-md space-y-3 rounded-lg border border-rose-900/60 bg-[#161b22] p-4 shadow-lg">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-rose-300">WebContainer failed to start</p>
                  <p className="text-[11px] leading-relaxed text-neutral-400">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-950 transition hover:bg-emerald-400"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>

        {!isMinimized && (
          <div className="flex min-h-[44px] shrink-0 items-center justify-between gap-3 border-t border-[#21262d] bg-gradient-to-b from-[#161b22] to-[#12171f] py-2 pl-3 pr-6">
            <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 text-[11px]">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  hasWorkspaceFiles
                    ? "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.55)]"
                    : "animate-pulse bg-amber-400/70"
                }`}
              />
              {saveError ? (
                <span className="truncate text-rose-400" title={saveError}>
                  {saveError}
                </span>
              ) : (
                <span className={`truncate ${hasWorkspaceFiles ? "text-emerald-300" : "text-neutral-400"}`}>
                  {hasWorkspaceFiles ? "Project files detected" : "Waiting for project files…"}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleOpenInEditor()}
              disabled={!hasWorkspaceFiles || isSaving || isClosing}
              title={
                hasWorkspaceFiles
                  ? "Save this workspace and open it in the code editor"
                  : "Create a file or folder in the terminal first"
              }
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 ${
                hasWorkspaceFiles && !isSaving && !isClosing
                  ? "bg-gradient-to-r from-emerald-500 to-cyan-400 text-emerald-950 shadow-[0_0_18px_rgba(16,185,129,0.45)] hover:shadow-[0_0_26px_rgba(16,185,129,0.65)] hover:brightness-110"
                  : "cursor-not-allowed border border-[#30363d] bg-[#1b222c] text-neutral-500"
              }`}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              <span>{isSaving ? "Saving project…" : "Open in Code Editor"}</span>
            </button>
          </div>
        )}

        {!isMaximized && (
          <div
            role="separator"
            aria-label="Resize terminal window"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
            style={{ touchAction: "none" }}
          >
            <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-[#484f58]" />
          </div>
        )}
      </div>
    </div>
  );
}
