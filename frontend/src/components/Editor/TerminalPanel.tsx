"use client";

import React, { useState, useRef, useEffect, useCallback, type MouseEvent } from "react";
import {
  Terminal as TerminalIcon,
  AlertCircle,
  FileText,
  Trash2,
  X,
  Plus,
  Square,
  Maximize2,
  Minimize2,
  ChevronDown,
  CheckCircle2,
  Play,
  Package,
  Cpu,
} from "lucide-react";
import { BottomTab, ConsoleMessage, Project, ProjectFile, ShellType, TerminalTabInfo, AvailableShell } from "@/types/editor";
import { webcontainerManager, type WebContainerShellHandle } from "@/lib/webcontainer/webcontainerManager";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: BottomTab;
  onSelectTab: (tab: BottomTab) => void;
  consoleMessages: ConsoleMessage[];
  onClearConsole: () => void;
  project: Project;
  onFilesSynced?: (files: ProjectFile[]) => void;
}

interface ActiveSessionHandle {
  term: XTerm;
  fitAddon: FitAddon;
  containerEl: HTMLDivElement;
  shell?: WebContainerShellHandle;
  isReady?: boolean;
}

const DEFAULT_AVAILABLE_SHELLS: AvailableShell[] = [
  { type: "bash", label: "WebContainer Shell (jsh)", path: "/bin/jsh" },
  { type: "sh", label: "Standard POSIX Shell", path: "/bin/sh" },
];

export default function TerminalPanel({
  isOpen,
  onToggle,
  activeTab,
  onSelectTab,
  consoleMessages,
  onClearConsole,
  project,
  onFilesSynced,
}: TerminalPanelProps) {
  // Panel dimensions and resize state
  const [panelHeight, setPanelHeight] = useState<number>(240);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startDragYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(240);

  // Terminal sessions state (Managed client-side in WebContainer)
  const [sessions, setSessions] = useState<TerminalTabInfo[]>([
    {
      id: "wc-session-1",
      name: "jsh (WebContainer)",
      shellType: "bash",
      isRunning: true,
      cwd: "/home/project",
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>("wc-session-1");
  const [isShellMenuOpen, setIsShellMenuOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [_runtimeStatus, setRuntimeStatus] = useState<"idle" | "booting" | "ready" | "error">("idle");
  const sessionCounterRef = useRef<number>(1);

  // Map of active xterm sessions: sessionId -> ActiveSessionHandle
  const sessionsMapRef = useRef<Map<string, ActiveSessionHandle>>(new Map());
  const masterContainerRef = useRef<HTMLDivElement>(null);

  const onFilesSyncedRef = useRef(onFilesSynced);
  useEffect(() => {
    onFilesSyncedRef.current = onFilesSynced;
  }, [onFilesSynced]);

  // Connect a session's xterm directly to WebContainer's in-browser shell
  const setupSessionConnection = useCallback(
    async (sessionId: string, handle: ActiveSessionHandle) => {
      const { term, fitAddon } = handle;

      if (handle.isReady) return;

      try {
        setRuntimeStatus("booting");
        term.write("\x1b[36m[WebContainer]\x1b[0m Initializing in-browser Node.js runtime...\r\n");

        // Ensure project files are mounted into WebContainer
        if (!webcontainerManager.isProjectMounted(project.id)) {
          term.write("\x1b[33m[WebContainer]\x1b[0m Mounting project files into virtual filesystem...\r\n");
          await webcontainerManager.mountProject(project.id, project.files);
        }

        // Spawn interactive jsh shell in WebContainer
        const shell = await webcontainerManager.spawnShell({
          cols: term.cols || 80,
          rows: term.rows || 24,
          onData: (data) => {
            term.write(data);
          },
        });

        handle.shell = shell;
        handle.isReady = true;
        setRuntimeStatus("ready");

        term.write("\x1b[32m[WebContainer]\x1b[0m Ready! Terminal commands run directly inside browser.\r\n");

        // Route raw xterm keystrokes directly to the WebContainer shell process
        term.onData((data) => {
          shell.write(data).catch(() => {});
        });

        // Route xterm resize events directly to the WebContainer process
        term.onResize(({ cols, rows }) => {
          shell.resize(cols, rows);
        });

        // Synchronize initial dimensions
        setTimeout(() => {
          try {
            fitAddon.fit();
            shell.resize(term.cols, term.rows);
          } catch {}
        }, 100);

        // Listen for shell exit
        shell.exit.then((code) => {
          term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
        });
      } catch (err) {
        console.error("[WebContainer] Failed to spawn shell:", err);
        setRuntimeStatus("error");
        term.write(
          `\r\n\x1b[31m[WebContainer Error] ${
            err instanceof Error ? err.message : "Failed to initialize WebContainer"
          }\x1b[0m\r\n`
        );
        if (!webcontainerManager.isSupported()) {
          term.write(
            "\x1b[33mNote: WebContainers require Cross-Origin Isolation (COOP and COEP headers).\x1b[0m\r\n"
          );
        }
      }
    },
    [project.id, project.files]
  );

  // Initialize or reveal active xterm instance
  useEffect(() => {
    if (!isOpen || activeTab !== "terminal" || !activeSessionId || !masterContainerRef.current) {
      return;
    }

    const sessionInfo = sessions.find((s) => s.id === activeSessionId);
    if (!sessionInfo) return;

    let handle = sessionsMapRef.current.get(activeSessionId);

    if (handle) {
      if (masterContainerRef.current && !masterContainerRef.current.contains(handle.containerEl)) {
        masterContainerRef.current.appendChild(handle.containerEl);
      }
    } else {
      // 1. Create container element
      const containerEl = document.createElement("div");
      containerEl.className = "w-full h-full";
      containerEl.style.height = "100%";
      containerEl.style.width = "100%";
      masterContainerRef.current.appendChild(containerEl);

      // 2. Create xterm.js instance
      const term = new XTerm({
        cursorBlink: true,
        cursorStyle: "block",
        cursorInactiveStyle: "outline",
        cursorWidth: 1,
        scrollback: 5000,
        fontFamily: '"Consolas", "Courier New", monospace',
        fontSize: 14,
        letterSpacing: 0,
        lineHeight: 1.5,
        theme: {
          background: "#181818",
          foreground: "#cccccc",
          cursor: "#ffffff",
          selectionBackground: "#264f78",
          black: "#000000",
          red: "#cd3131",
          green: "#0dbc79",
          yellow: "#e5e510",
          blue: "#2472c8",
          magenta: "#bc3fbc",
          cyan: "#11a8cd",
          white: "#e5e5e5",
          brightBlack: "#666666",
          brightRed: "#f14c4c",
          brightGreen: "#23d18b",
          brightYellow: "#f5f543",
          brightBlue: "#3b8eea",
          brightMagenta: "#d670d6",
          brightCyan: "#29b8db",
          brightWhite: "#ffffff",
        },
        convertEol: true,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && term.hasSelection()) {
          return false;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
          return false;
        }
        return true;
      });

      term.open(containerEl);

      handle = {
        term,
        fitAddon,
        containerEl,
        isReady: false,
      };

      sessionsMapRef.current.set(activeSessionId, handle);

      // 3. Connect to in-browser WebContainer shell
      setupSessionConnection(activeSessionId, handle);
    }

    // Hide inactive session containers and show the active one
    sessionsMapRef.current.forEach((h, sId) => {
      if (sId === activeSessionId) {
        h.containerEl.style.display = "block";
        setTimeout(() => {
          try {
            h.fitAddon.fit();
          } catch {}
        }, 50);
      } else {
        h.containerEl.style.display = "none";
      }
    });
  }, [isOpen, activeTab, activeSessionId, sessions, setupSessionConnection]);

  // Re-fit active terminal whenever terminal panel is revealed
  useEffect(() => {
    if (isOpen && activeTab === "terminal" && activeSessionId) {
      const handle = sessionsMapRef.current.get(activeSessionId);
      if (handle) {
        const timer = setTimeout(() => {
          try {
            handle.fitAddon.fit();
          } catch {}
        }, 80);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, activeTab, activeSessionId, panelHeight, isMaximized]);

  // Window Resize Refit
  useEffect(() => {
    const handleResize = () => {
      if (isOpen && activeTab === "terminal" && activeSessionId) {
        const handle = sessionsMapRef.current.get(activeSessionId);
        if (handle) {
          try {
            handle.fitAddon.fit();
          } catch {}
        }
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, activeTab, activeSessionId]);

  // Handle Drag Resizing of Terminal Panel Height
  const handleMouseDownResize = (e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startDragYRef.current = e.clientY;
    startHeightRef.current = panelHeight;

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaY = startDragYRef.current - moveEvent.clientY;
      const maxHeight = window.innerHeight * 0.85;
      const newHeight = Math.min(Math.max(startHeightRef.current + deltaY, 140), maxHeight);
      setPanelHeight(newHeight);

      const activeHandle = sessionsMapRef.current.get(activeSessionId);
      if (activeHandle) {
        try {
          activeHandle.fitAddon.fit();
        } catch {}
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Create New Session Tab in WebContainer
  const handleCreateSession = (shellType: ShellType = "bash") => {
    setIsShellMenuOpen(false);
    sessionCounterRef.current += 1;
    const newId = `wc-session-${sessionCounterRef.current}`;
    const newSession: TerminalTabInfo = {
      id: newId,
      name: `jsh (${sessions.length + 1})`,
      shellType,
      isRunning: true,
      cwd: "/home/project",
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newId);
  };

  // Close Session Tab
  const handleCloseSession = (e: MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const handle = sessionsMapRef.current.get(sessionId);
    if (handle) {
      if (handle.shell) handle.shell.kill();
      handle.term.dispose();
      handle.containerEl.remove();
      sessionsMapRef.current.delete(sessionId);
    }

    const remaining = sessions.filter((s) => s.id !== sessionId);
    setSessions(remaining);

    if (remaining.length === 0) {
      handleCreateSession();
    } else if (activeSessionId === sessionId) {
      setActiveSessionId(remaining[0].id);
    }
  };

  // Cleanup all open xterm sessions on unmount or project switch
  useEffect(() => {
    const currentSessions = sessionsMapRef.current;
    return () => {
      currentSessions.forEach((handle) => {
        try {
          if (handle.shell) handle.shell.kill();
          handle.term.dispose();
          handle.containerEl.remove();
        } catch {}
      });
      currentSessions.clear();
    };
  }, [project.id]);

  // Rename Session Tab
  const handleRenameSessionSubmit = (sessionId: string) => {
    if (!editingName.trim()) {
      setEditingSessionId(null);
      return;
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, name: editingName.trim() } : s))
    );
    setEditingSessionId(null);
  };

  // Kill Running Foreground Process (Ctrl+C)
  const handleKillActive = () => {
    if (!activeSessionId) return;
    const handle = sessionsMapRef.current.get(activeSessionId);
    if (handle?.shell) {
      handle.shell.write("\x03"); // SIGINT / Ctrl+C
    }
  };

  // Clear Terminal
  const handleClearActive = () => {
    if (!activeSessionId) return;
    const handle = sessionsMapRef.current.get(activeSessionId);
    if (handle) {
      handle.term.clear();
      if (handle.shell) {
        handle.shell.write("\x0c"); // Ctrl+L
      }
    }
  };

  // Helper to send a command line to the active terminal
  const handleRunCommand = (command: string) => {
    if (!activeSessionId) return;
    const handle = sessionsMapRef.current.get(activeSessionId);
    if (handle?.shell) {
      handle.shell.write(`${command}\r`);
      handle.term.focus();
    }
  };

  // Right-Click Paste Support
  const handleContextMenu = async (e: MouseEvent) => {
    e.preventDefault();
    if (!activeSessionId) return;
    try {
      const text = await navigator.clipboard?.readText?.();
      if (text) {
        const handle = sessionsMapRef.current.get(activeSessionId);
        if (handle) {
          handle.term.paste(text);
        }
      }
    } catch {}
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const currentHeight = isMaximized ? "85vh" : `${panelHeight}px`;

  return (
    <div
      data-testid="terminal-panel"
      style={{ height: currentHeight, display: isOpen ? "flex" : "none" }}
      className="bg-[#181818] border-t border-[#2b2b2b] flex-col font-sans text-xs select-none shrink-0 z-20 relative transition-all duration-75"
    >
      {/* Top Drag Handle for Resizing */}
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={() => setIsMaximized((prev) => !prev)}
        className={`h-1.5 w-full absolute -top-1 left-0 cursor-ns-resize z-30 transition-colors ${
          isDragging ? "bg-[var(--color-primary)]" : "hover:bg-[var(--color-primary)]/70"
        }`}
        title="Drag to resize terminal panel (double click to maximize)"
      />

      {/* Main Panel Toolbar */}
      <div className="h-8 bg-[#252526] border-b border-[#1e1e1e] px-2.5 flex items-center justify-between shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onSelectTab("terminal");
              if (activeSessionId) {
                sessionsMapRef.current.get(activeSessionId)?.term.focus();
              }
            }}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-t font-medium transition cursor-pointer text-xs ${
              activeTab === "terminal"
                ? "bg-[#181818] text-white border-t-2 border-t-[var(--color-primary)] font-semibold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>Terminal</span>
            {activeSession?.isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("output")}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-t font-medium transition cursor-pointer text-xs ${
              activeTab === "output"
                ? "bg-[#181818] text-white border-t-2 border-t-[var(--color-primary)] font-semibold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Output / Console</span>
            {consoleMessages.length > 0 && (
              <span className="text-[10px] px-1 bg-neutral-700 rounded-full font-mono">
                {consoleMessages.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("problems")}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-t font-medium transition cursor-pointer text-xs ${
              activeTab === "problems"
                ? "bg-[#181818] text-white border-t-2 border-t-[var(--color-primary)] font-semibold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Problems</span>
          </button>
        </div>

        {/* Center: Terminal Tab Pills */}
        {activeTab === "terminal" && sessions.length > 0 && (
          <div className="flex items-center gap-1.5 max-w-[40%] overflow-x-auto no-scrollbar py-0.5">
            {sessions.map((sess) => {
              const isSelected = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => {
                    setActiveSessionId(sess.id);
                    sessionsMapRef.current.get(sess.id)?.term.focus();
                  }}
                  onDoubleClick={() => {
                    setEditingSessionId(sess.id);
                    setEditingName(sess.name);
                  }}
                  className={`group flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border transition ${
                    isSelected
                      ? "bg-[#1e1e1e] border-neutral-700 text-white font-medium"
                      : "bg-[#2d2d2d]/60 border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-[#2d2d2d]"
                  }`}
                  title="Click to switch, double click to rename"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />

                  {editingSessionId === sess.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleRenameSessionSubmit(sess.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSessionSubmit(sess.id);
                        if (e.key === "Escape") setEditingSessionId(null);
                      }}
                      className="bg-black/60 text-white text-[10px] px-1 rounded outline-none border border-[var(--color-primary)] w-20"
                    />
                  ) : (
                    <span>{sess.name}</span>
                  )}

                  {sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleCloseSession(e, sess.id)}
                      className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                      title="Kill and close terminal tab"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Right: Actions Toolbar */}
        <div className="flex items-center gap-1.5 text-neutral-400">
          {activeTab === "terminal" && (
            <>
              {/* WebContainer Runtime Badge */}
              <div
                className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border border-neutral-700 bg-black/40 text-neutral-300"
                title="Code runs entirely in your browser using WebContainers"
              >
                <Cpu className="w-3 h-3 text-cyan-400" />
                <span className="text-cyan-300">WebContainer</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>

              {/* Quick Action: npm install */}
              <button
                type="button"
                onClick={() => handleRunCommand("npm install")}
                title="Run 'npm install' inside WebContainer"
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
              >
                <Package className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">npm i</span>
              </button>

              {/* Quick Action: npm run dev */}
              <button
                type="button"
                onClick={() => handleRunCommand("npm run dev")}
                title="Run 'npm run dev' inside WebContainer"
                className="px-2 py-0.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
              >
                <Play className="w-3 h-3 text-emerald-400 fill-current" />
                <span className="hidden sm:inline">npm run dev</span>
              </button>

              {/* Stop Running Process (Ctrl+C) */}
              <button
                type="button"
                onClick={handleKillActive}
                title="Interrupt foreground process (Ctrl+C)"
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-rose-950/80 hover:text-rose-300 border border-neutral-700 text-neutral-300 font-medium text-[11px] flex items-center gap-1 transition cursor-pointer"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>Ctrl+C</span>
              </button>

              {/* New Terminal Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsShellMenuOpen((prev) => !prev)}
                  title="New Terminal"
                  className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>

                {isShellMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 w-48 bg-[#252526] border border-[#3e3e42] rounded-lg shadow-xl py-1 z-50 text-xs font-mono"
                  >
                    <div className="px-2.5 py-1 text-[10px] text-neutral-400 font-sans uppercase font-bold border-b border-[#333333]">
                      Available Shells
                    </div>
                    {DEFAULT_AVAILABLE_SHELLS.map((sh) => (
                      <button
                        key={sh.type + sh.label}
                        type="button"
                        onClick={() => handleCreateSession(sh.type)}
                        className="w-full text-left px-3 py-1.5 text-neutral-300 hover:text-white hover:bg-[var(--color-primary)]/20 transition cursor-pointer flex items-center justify-between"
                      >
                        <span>{sh.label}</span>
                        <span className="text-[10px] text-neutral-500 font-sans">
                          {sh.type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Clear Terminal */}
              <button
                type="button"
                onClick={handleClearActive}
                title="Clear terminal (Ctrl+L)"
                className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {activeTab === "output" && (
            <button
              type="button"
              onClick={onClearConsole}
              title="Clear Console Output"
              className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Maximize / Restore Toggle */}
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            title={isMaximized ? "Restore Panel Size" : "Maximize Panel Size"}
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close Bottom Panel */}
          <button
            type="button"
            onClick={onToggle}
            title="Close Panel"
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Panel Viewport */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-[#181818]">
        {/* View 1: Multi-tab Integrated Terminal */}
        <div
          ref={masterContainerRef}
          onContextMenu={handleContextMenu}
          style={{ display: activeTab === "terminal" ? "block" : "none" }}
          className="w-full h-full p-2 overflow-hidden select-text"
        />

        {/* View 2: Output / Console Logs */}
        {activeTab === "output" && (
          <div className="w-full h-full overflow-y-auto p-3 font-mono text-xs select-text space-y-1">
            {consoleMessages.length === 0 ? (
              <div className="text-neutral-500 italic py-4 text-center">
                No console messages recorded. Run the preview or execute code to view output logs.
              </div>
            ) : (
              consoleMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2 py-0.5 border-b border-neutral-800/40 ${
                    msg.type === "error"
                      ? "text-rose-400"
                      : msg.type === "warn"
                      ? "text-amber-400"
                      : msg.type === "info"
                      ? "text-sky-400"
                      : "text-neutral-300"
                  }`}
                >
                  <span className="text-[10px] text-neutral-500 shrink-0">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-[10px] font-bold uppercase shrink-0">
                    [{msg.type}]
                  </span>
                  <span className="whitespace-pre-wrap break-all flex-1">{msg.content}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* View 3: Problems & Diagnostic List */}
        {activeTab === "problems" && (
          <div className="w-full h-full overflow-y-auto p-4 font-mono text-xs select-text">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>No workspace diagnostics or syntax errors detected.</span>
            </div>
            <p className="text-neutral-500 text-[11px] leading-relaxed">
              Monaco Editor provides real-time language diagnostics, syntax checking, and type validation directly in the editor buffer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
