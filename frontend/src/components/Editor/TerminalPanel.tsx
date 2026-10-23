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
  Folder,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { BottomTab, ConsoleMessage, Project, ProjectFile, ShellType, TerminalTabInfo, AvailableShell } from "@/types/editor";
import { cloudApi } from "@/lib/cloud/cloudApi";
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
  ws?: WebSocket;
  isWsConnected: boolean;
  httpAbortController?: AbortController;
  hasReceivedInitBuffer?: boolean;
}

function TerminalPanel({
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

  // Terminal sessions state
  const [sessions, setSessions] = useState<TerminalTabInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [availableShells, setAvailableShells] = useState<AvailableShell[]>([]);
  const [wsPort, setWsPort] = useState<number>(3005);
  const [isShellMenuOpen, setIsShellMenuOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Map of active xterm sessions: sessionId -> ActiveSessionHandle
  const sessionsMapRef = useRef<Map<string, ActiveSessionHandle>>(new Map());
  const masterContainerRef = useRef<HTMLDivElement>(null);

  const onFilesSyncedRef = useRef(onFilesSynced);
  useEffect(() => {
    onFilesSyncedRef.current = onFilesSynced;
  }, [onFilesSynced]);

  // Load available sessions and shells from backend
  const loadSessionsData = useCallback(async () => {
    try {
      const data = await cloudApi.terminal.getSessions(project.id);
      setSessions(data.sessions);
      setAvailableShells(data.availableShells);
      if (typeof data.wsPort === "number") {
        setWsPort(data.wsPort);
      }

      if (data.sessions.length > 0) {
        setActiveSessionId((prev) => {
          if (prev && data.sessions.some((s) => s.id === prev)) return prev;
          return data.sessions[0].id;
        });
      } else {
        // If a terminal session does not exist, create one when the user first opens the terminal
        try {
          const createRes = await cloudApi.terminal.createSession(project.id);
          if (createRes?.session) {
            setSessions([createRes.session]);
            setActiveSessionId(createRes.session.id);
          }
        } catch (createErr) {
          console.warn("Failed to create initial terminal session:", createErr);
        }
      }
    } catch (err) {
      console.warn("Failed to load terminal sessions:", err);
    }
  }, [project.id]);

  useEffect(() => {
    if (isOpen) {
      loadSessionsData();
    }
  }, [isOpen, loadSessionsData]);

  // Connect a session's xterm directly to the persistent PTY backend
  const setupSessionConnection = useCallback(
    (sessionId: string, handle: ActiveSessionHandle) => {
      const { term, fitAddon } = handle;

      // 1. Establish authenticated WebSocket connection to persistent PTY
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const hostname = window.location.hostname || "localhost";
      const wsUrl = `${protocol}//${hostname}:${wsPort}?projectId=${encodeURIComponent(project.id)}&sessionId=${encodeURIComponent(sessionId)}`;

      let socket: WebSocket | null = null;
      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        console.warn("WebSocket creation error, falling back to HTTP stream:", err);
      }

      // Fallback helper for HTTP stream
      const startHttpStreamingFallback = () => {
        handle.isWsConnected = false;
        const controller = new AbortController();
        handle.httpAbortController = controller;

        fetch(`/api/projects/${project.id}/terminal/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
        })
          .then(async (res) => {
            if (!res.ok || !res.body) return;
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  try {
                    const event = JSON.parse(trimmed.slice(6));
                    if (event.type === "output" && typeof event.data === "string") {
                      term.write(event.data);
                    } else if (event.type === "sync" && event.updatedFiles && onFilesSyncedRef.current) {
                      onFilesSyncedRef.current(event.updatedFiles);
                    }
                  } catch {}
                }
              }
            }
          })
          .catch(() => {});
      };

      if (socket) {
        handle.ws = socket;

        socket.onopen = () => {
          handle.isWsConnected = true;
          // Synchronize initial dimensions
          try {
            fitAddon.fit();
            socket?.send(
              JSON.stringify({
                type: "resize",
                cols: term.cols,
                rows: term.rows,
              })
            );
          } catch {}
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "init") {
              if (msg.buffer && !handle.hasReceivedInitBuffer) {
                handle.hasReceivedInitBuffer = true;
                term.write(msg.buffer);
              }
            } else if (msg.type === "output" && typeof msg.data === "string") {
              term.write(msg.data);
            } else if (msg.type === "sync" && msg.updatedFiles && onFilesSyncedRef.current) {
              onFilesSyncedRef.current(msg.updatedFiles);
            }
          } catch (err) {
            console.warn("WebSocket parse error:", err);
          }
        };

        socket.onerror = () => {
          console.warn("WebSocket connection failed, switching to HTTP stream...");
          startHttpStreamingFallback();
        };

        socket.onclose = () => {
          if (handle.isWsConnected) {
            handle.isWsConnected = false;
          }
        };
      } else {
        startHttpStreamingFallback();
      }

      // 2. Route raw xterm keystrokes directly to the PTY
      term.onData((data) => {
        if (handle.ws && handle.ws.readyState === WebSocket.OPEN) {
          handle.ws.send(JSON.stringify({ type: "input", data }));
        } else {
          // HTTP Fallback
          fetch(`/api/projects/${project.id}/terminal/input`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, input: data }),
          }).catch(() => {});
        }
      });

      // 3. Route xterm resize events directly to the PTY
      term.onResize(({ cols, rows }) => {
        if (handle.ws && handle.ws.readyState === WebSocket.OPEN) {
          handle.ws.send(JSON.stringify({ type: "resize", cols, rows }));
        } else {
          // HTTP Fallback
          fetch(`/api/projects/${project.id}/terminal/resize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, cols, rows }),
          }).catch(() => {});
        }
      });
    },
    [project.id, wsPort]
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

      // 2. Create xterm.js instance with genuine VS Code typography
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

      // Clipboard and shortcut integration:
      // Allow browser native Copy (Ctrl+C / Cmd+C when text is highlighted)
      // and native Paste (Ctrl+V / Cmd+V) to flow into xterm's built-in textarea paste handler.
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
        isWsConnected: false,
      };

      sessionsMapRef.current.set(activeSessionId, handle);

      // 3. Connect to backend PTY
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
  }, [isOpen, activeTab, activeSessionId, setupSessionConnection]);

  // Re-fit active terminal whenever terminal panel is revealed
  useEffect(() => {
    if (isOpen && activeTab === "terminal" && activeSessionId) {
      const handle = sessionsMapRef.current.get(activeSessionId);
      if (handle) {
        const timer = setTimeout(() => {
          try {
            handle.fitAddon.fit();
          } catch {}
        }, 30);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, activeTab, activeSessionId]);

  // Handle Window Resize
  useEffect(() => {
    const handleResize = () => {
      const activeHandle = sessionsMapRef.current.get(activeSessionId);
      if (activeHandle) {
        try {
          activeHandle.fitAddon.fit();
        } catch {}
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeSessionId]);

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

  // Create New Session Tab
  const handleCreateSession = async (shellType?: ShellType) => {
    setIsShellMenuOpen(false);
    try {
      const res = await cloudApi.terminal.createSession(project.id, shellType);
      await loadSessionsData();
      setActiveSessionId(res.session.id);
      setTimeout(() => {
        sessionsMapRef.current.get(res.session.id)?.term.focus();
      }, 50);
    } catch (err) {
      console.warn("Failed to create session:", err);
    }
  };

  // Close Session Tab
  const handleCloseSession = async (e: MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      const handle = sessionsMapRef.current.get(sessionId);
      if (handle) {
        if (handle.ws) handle.ws.close();
        if (handle.httpAbortController) handle.httpAbortController.abort();
        handle.term.dispose();
        handle.containerEl.remove();
        sessionsMapRef.current.delete(sessionId);
      }

      await cloudApi.terminal.closeSession(project.id, sessionId);
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);

      if (remaining.length === 0) {
        const newSess = await cloudApi.terminal.createSession(project.id);
        await loadSessionsData();
        setActiveSessionId(newSess.session.id);
      } else if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0].id);
      }
    } catch (err) {
      console.warn("Failed to close session:", err);
    }
  };

  // Cleanup all open xterm sessions on unmount or project switch
  useEffect(() => {
    return () => {
      sessionsMapRef.current.forEach((handle) => {
        try {
          if (handle.ws) handle.ws.close();
          if (handle.httpAbortController) handle.httpAbortController.abort();
          handle.term.dispose();
          handle.containerEl.remove();
        } catch {}
      });
      sessionsMapRef.current.clear();
    };
  }, [project.id]);

  // Rename Session Tab
  const handleRenameSessionSubmit = async (sessionId: string) => {
    if (!editingName.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      await cloudApi.terminal.renameSession(project.id, sessionId, editingName.trim());
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, name: editingName.trim() } : s))
      );
    } catch (err) {
      console.warn("Failed to rename session:", err);
    } finally {
      setEditingSessionId(null);
    }
  };

  // Kill Running Process / Send Ctrl+C
  const handleKillActive = () => {
    if (!activeSessionId) return;
    const handle = sessionsMapRef.current.get(activeSessionId);
    if (handle?.ws && handle.ws.readyState === WebSocket.OPEN) {
      handle.ws.send(JSON.stringify({ type: "kill" }));
    } else {
      cloudApi.terminal.killSession(project.id, activeSessionId);
    }
  };

  // Clear Terminal
  const handleClearActive = () => {
    if (!activeSessionId) return;
    const handle = sessionsMapRef.current.get(activeSessionId);
    if (handle) {
      handle.term.clear();
      // Send Ctrl+L to shell
      if (handle.ws && handle.ws.readyState === WebSocket.OPEN) {
        handle.ws.send(JSON.stringify({ type: "input", data: "\x0c" }));
      }
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

        {/* Center: Terminal Tab Pills (VS Code Multiple Terminals) */}
        {activeTab === "terminal" && sessions.length > 0 && (
          <div className="flex items-center gap-1.5 max-w-[50%] overflow-x-auto no-scrollbar py-0.5">
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
        <div className="flex items-center gap-1 text-neutral-400">
          {activeTab === "terminal" && (
            <>
              {/* Working Directory Indicator */}
              <div className="hidden lg:flex items-center gap-1 font-mono text-[11px] text-neutral-400 bg-black/40 px-2 py-0.5 rounded mr-1 border border-neutral-800">
                <Folder className="w-3 h-3 text-amber-400" />
                <span className="text-emerald-400">~/project</span>
              </div>

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
                    {availableShells.map((sh) => (
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
              title="Clear output console"
              className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Maximize / Restore Button */}
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            title={isMaximized ? "Restore panel size" : "Maximize panel"}
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close Panel Button */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggle}
            title="Hide panel"
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Panel Content Body */}
      <div className="flex-1 overflow-hidden relative bg-[#181818]">
        {/* Terminal Tab: Persistent PTY-driven xterm Canvas */}
        <div
          ref={masterContainerRef}
          onContextMenu={handleContextMenu}
          style={{ display: activeTab === "terminal" ? "block" : "none" }}
          className="w-full h-full p-2 overflow-hidden cursor-text select-text"
          onClick={() => {
            if (activeSessionId) {
              sessionsMapRef.current.get(activeSessionId)?.term.focus();
            }
          }}
        />

        {/* Output / Console Tab Content */}
        {activeTab === "output" && (
          <div className="h-full overflow-y-auto p-3 text-neutral-300 font-mono text-xs space-y-1">
            {consoleMessages.length === 0 ? (
              <div className="text-neutral-500 italic py-2">
                No runtime logs yet. Preview activity and system events will appear here.
              </div>
            ) : (
              consoleMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 py-0.5 ${
                    msg.type === "error"
                      ? "text-rose-400 bg-rose-950/20 px-1 rounded"
                      : msg.type === "warn"
                      ? "text-amber-400"
                      : "text-neutral-300"
                  }`}
                >
                  <span className="text-neutral-600 select-none text-[10px]">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="font-semibold uppercase text-[10px] select-none text-neutral-500">
                    [{msg.type}]
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-all">{msg.content}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Problems Tab Content */}
        {activeTab === "problems" && (
          <div className="h-full overflow-y-auto p-4 flex items-center gap-2 text-neutral-400 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Workspace is healthy. No unresolved compiler errors or diagnostics detected.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(TerminalPanel);
