"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cloudApi } from "@/lib/cloud/cloudApi";
import { ProjectTemplate } from "@/types/editor";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}

interface DetectedInfo {
  path: string;
  name: string;
  template: ProjectTemplate;
  frameworkLabel: string;
  fileCount: number;
  entryFile?: string;
}

const DEFAULT_TERMINAL_HEIGHT = 420;
const MIN_TERMINAL_HEIGHT = 220;
const MODAL_CHROME_HEIGHT = 172;
const TERMINAL_HEIGHT_STORAGE_KEY = "code-editor:new-project-terminal-height";

function getTerminalHeightBounds() {
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const max = Math.max(160, Math.floor(viewportHeight * 0.85) - MODAL_CHROME_HEIGHT);
  const min = Math.min(MIN_TERMINAL_HEIGHT, max);
  return { min, max };
}

function clampTerminalHeight(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function NewProjectDialog({
  isOpen,
  onClose,
  onCreated,
}: NewProjectDialogProps) {
  const router = useRouter();

  // Session state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isInitializingSession, setIsInitializingSession] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TERMINAL_HEIGHT;

    const { min, max } = getTerminalHeightBounds();
    let nextHeight = DEFAULT_TERMINAL_HEIGHT;
    try {
      const storedHeight = Number(localStorage.getItem(TERMINAL_HEIGHT_STORAGE_KEY));
      if (Number.isFinite(storedHeight) && storedHeight > 0) {
        nextHeight = storedHeight;
      }
    } catch {}
    return clampTerminalHeight(nextHeight, min, max);
  });
  const [isResizingTerminal, setIsResizingTerminal] = useState(false);

  // Project detection
  const [detectedProjects, setDetectedProjects] = useState<DetectedInfo[]>([]);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Terminal emulator references
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);
  const terminalHeightRef = useRef(terminalHeight);
  const terminalResizeDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    min: number;
    max: number;
  } | null>(null);
  const terminalResizeCleanupRef = useRef<(() => void) | null>(null);
  const suppressBackdropCloseRef = useRef(false);
  const finalizingRef = useRef(false);

  const fitTerminal = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;
    try {
      fitAddonRef.current.fit();
      if (isAtBottomRef.current) {
        xtermRef.current.scrollToBottom();
      }
    } catch {}
  }, []);

  const scheduleTerminalFit = useCallback(() => {
    if (fitFrameRef.current !== null) {
      cancelAnimationFrame(fitFrameRef.current);
    }
    fitFrameRef.current = requestAnimationFrame(() => {
      fitFrameRef.current = null;
      fitTerminal();
    });
  }, [fitTerminal]);

  const writeTerminalChunk = useCallback((term: XTerm, data: string, forceBottom = false) => {
    const shouldFollowOutput = forceBottom || isAtBottomRef.current;
    if (forceBottom) {
      isAtBottomRef.current = true;
    }
    term.write(data, () => {
      if (shouldFollowOutput) {
        term.scrollToBottom();
      }
    });
  }, []);

  // Refresh project detection helper
  const refreshDetection = useCallback(async (targetId: string) => {
    try {
      const detected = await cloudApi.terminal.detect(targetId);
      setDetectedProjects(detected);
    } catch (err) {
      console.warn("Detection check failed:", err);
    }
  }, []);

  // Keep the terminal inside the dialog as the viewport changes.
  useEffect(() => {
    if (!isOpen) return;

    const onResize = () => {
      const { min, max } = getTerminalHeightBounds();
      const nextHeight = clampTerminalHeight(terminalHeightRef.current, min, max);
      terminalHeightRef.current = nextHeight;
      setTerminalHeight(nextHeight);
      scheduleTerminalFit();
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen, scheduleTerminalFit]);

  // Refit xterm whenever its container changes size.
  useEffect(() => {
    if (!isOpen || !terminalContainerRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => scheduleTerminalFit());
    observer.observe(terminalContainerRef.current);
    return () => observer.disconnect();
  }, [isOpen, scheduleTerminalFit]);

  useEffect(() => {
    return () => {
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }
      terminalResizeCleanupRef.current?.();
      terminalResizeCleanupRef.current = null;
    };
  }, []);

  // Initialize terminal session and setup genuine xterm emulator
  useEffect(() => {
    if (!isOpen) {
      // Cleanup on close
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
      if (xtermRef.current) xtermRef.current.dispose();
      detectionIntervalRef.current = null;
      mountTimeoutRef.current = null;
      wsRef.current = null;
      xtermRef.current = null;
      fitAddonRef.current = null;
      isAtBottomRef.current = true;
      setProjectId(null);
      setDetectedProjects([]);
      return;
    }

    let isMounted = true;
    setIsInitializingSession(true);
    setErrorMsg(null);

    const init = async () => {
      try {
        const session = await cloudApi.terminal.startSession("cloud-app");
        if (!isMounted) {
          await cloudApi.terminal.cleanup(session.projectId).catch(() => {});
          return;
        }

        const sessionProjectId = session.projectId;
        const sessId = session.sessionId;
        if (!sessionProjectId || !sessId) {
          throw new Error("Terminal session did not return a project and session ID.");
        }

        setProjectId(sessionProjectId);
        setIsInitializingSession(false);

        // Mount xterm after container element is rendered
        mountTimeoutRef.current = setTimeout(() => {
          if (!isMounted || !terminalContainerRef.current) return;

          terminalContainerRef.current.innerHTML = "";
          isAtBottomRef.current = true;

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
              background: "#0c0d14",
              foreground: "#d4d4d4",
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

          term.open(terminalContainerRef.current);
          try {
            fitAddon.fit();
            term.scrollToBottom();
            term.focus();
          } catch {}

          xtermRef.current = term;
          fitAddonRef.current = fitAddon;
          isAtBottomRef.current = true;

          term.onScroll(() => {
            const buffer = term.buffer.active;
            isAtBottomRef.current = buffer.viewportY >= buffer.baseY;
          });

          // Connect WebSocket to persistent PTY process
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const hostname = window.location.hostname || "localhost";
          const wsPort = session.wsPort || 3005;
          const wsUrl = `${protocol}//${hostname}:${wsPort}?projectId=${encodeURIComponent(sessionProjectId)}&sessionId=${encodeURIComponent(sessId)}`;

          let hasReceivedInitBuffer = false;
          let ws: WebSocket | null = null;
          try {
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;
          } catch (e) {
            console.warn("WebSocket creation error in NewProjectDialog:", e);
          }

          if (ws) {
            ws.onopen = () => {
              try {
                fitAddon.fit();
                ws?.send(
                  JSON.stringify({
                    type: "resize",
                    cols: term.cols,
                    rows: term.rows,
                  })
                );
              } catch {}
            };

            ws.onmessage = (event) => {
              try {
                const msg = JSON.parse(event.data);
                if (msg.type === "init") {
                  if (msg.buffer && !hasReceivedInitBuffer) {
                    hasReceivedInitBuffer = true;
                    writeTerminalChunk(term, msg.buffer, true);
                  }
                } else if (msg.type === "output" && typeof msg.data === "string") {
                  writeTerminalChunk(term, msg.data);
                  refreshDetection(sessionProjectId);
                }
              } catch (e) {
                console.warn("WS parse error:", e);
              }
            };

            // Route raw keystrokes directly to persistent PTY
            term.onData((data) => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "input", data }));
              } else {
                cloudApi.terminal.sendSessionInput(sessionProjectId, sessId, data);
              }
            });

            // Route resize
            term.onResize(({ cols, rows }) => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "resize", cols, rows }));
              }
            });

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
          }

          // Initial detection check
          refreshDetection(sessionProjectId);

          // Periodic detection check every 2.5 seconds
          detectionIntervalRef.current = setInterval(() => {
            if (sessionProjectId) {
              refreshDetection(sessionProjectId);
            }
          }, 2500);
        }, 50);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to initialize terminal session";
        setErrorMsg(msg);
        setIsInitializingSession(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
      if (xtermRef.current) xtermRef.current.dispose();
      detectionIntervalRef.current = null;
      mountTimeoutRef.current = null;
      wsRef.current = null;
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [isOpen, refreshDetection, writeTerminalChunk]);

  const persistTerminalHeight = useCallback(() => {
    try {
      localStorage.setItem(TERMINAL_HEIGHT_STORAGE_KEY, String(terminalHeightRef.current));
    } catch {}
  }, []);

  const handleTerminalResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const { min, max } = getTerminalHeightBounds();
    terminalResizeDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: terminalHeightRef.current,
      min,
      max,
    };

    terminalResizeCleanupRef.current?.();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    setIsResizingTerminal(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const drag = terminalResizeDragRef.current;
      if (!drag || drag.pointerId !== moveEvent.pointerId) return;

      const nextHeight = clampTerminalHeight(
        drag.startHeight + drag.startY - moveEvent.clientY,
        drag.min,
        drag.max
      );
      terminalHeightRef.current = nextHeight;
      setTerminalHeight(nextHeight);
      scheduleTerminalFit();
    };

    const finishResize = () => {
      terminalResizeDragRef.current = null;
      setIsResizingTerminal(false);
      persistTerminalHeight();
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("blur", finishResize);
      terminalResizeCleanupRef.current = null;

      suppressBackdropCloseRef.current = true;
      window.setTimeout(() => {
        suppressBackdropCloseRef.current = false;
      }, 250);
    };

    terminalResizeCleanupRef.current = finishResize;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    window.addEventListener("blur", finishResize);
    event.preventDefault();
  };

  // Finalize and Open in Editor
  const handleOpenProjectInEditor = async () => {
    if (finalizingRef.current) return;
    if (!projectId) {
      setErrorMsg("The project session is still starting. Please wait a moment and try again.");
      return;
    }

    finalizingRef.current = true;
    setIsFinalizing(true);
    setErrorMsg(null);

    try {
      const topProject = detectedProjects[0];
      const subfolder = topProject && topProject.path ? topProject.path : undefined;

      const result = await cloudApi.terminal.finalize(projectId, {
        name: topProject?.name || "cloud-app",
        subfolder,
      });

      if (!result.projectId) {
        throw new Error("The project could not be saved. Please try again.");
      }

      onClose();
      setIsFinalizing(false);
      finalizingRef.current = false;
      if (onCreated) {
        onCreated(result.projectId);
      } else {
        router.push(result.redirectUrl || `/editor/${encodeURIComponent(result.projectId)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to finalize project setup";
      setErrorMsg(msg);
      setIsFinalizing(false);
      finalizingRef.current = false;
    }
  };

  // Safe Cancel and Cleanup
  const handleCancel = async () => {
    if (finalizingRef.current) return;

    if (projectId) {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      if (xtermRef.current) xtermRef.current.dispose();

      if (detectedProjects.length === 0 || detectedProjects[0]?.fileCount === 0) {
        await cloudApi.terminal.cleanup(projectId).catch(() => {});
      }
    }
    onClose();
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const text = await navigator.clipboard?.readText?.();
      if (text && xtermRef.current) {
        xtermRef.current.paste(text);
      }
    } catch {}
  };

  if (!isOpen) return null;

  const topDetected = detectedProjects[0];
  const hasFiles = Boolean(topDetected && topDetected.fileCount > 0);

  return (
    <div
      onClick={(event) => {
        if (suppressBackdropCloseRef.current) {
          suppressBackdropCloseRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        handleCancel();
      }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#0f1117] border border-neutral-800 rounded-xl shadow-2xl flex flex-col text-neutral-200 overflow-hidden max-h-[85vh]"
      >
        {/* Top Header: Only "New Project" */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-[#161822]">
          <h3 className="text-sm font-semibold text-white">New Project</h3>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800/80 transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          role="separator"
          aria-label="Resize terminal panel"
          aria-orientation="horizontal"
          title="Drag to resize terminal"
          onPointerDown={handleTerminalResizeStart}
          className={`h-2.5 shrink-0 flex items-center justify-center bg-[#161822] border-b border-neutral-800 touch-none select-none ${
            isResizingTerminal ? "cursor-ns-resize" : "cursor-ns-resize hover:bg-neutral-800"
          }`}
        >
          <div
            className={`w-10 h-1 rounded-full transition-colors ${
              isResizingTerminal ? "bg-[var(--color-primary)]" : "bg-neutral-600"
            }`}
          />
        </div>

        {/* Pure xterm.js Terminal Window Container */}
        <div
          onContextMenu={handleContextMenu}
          style={{ height: terminalHeight }}
          className="shrink-0 min-h-0 p-2.5 bg-[#0c0d14] relative overflow-hidden cursor-text select-text"
          onClick={() => xtermRef.current?.focus()}
        >
          {isInitializingSession && (
            <div className="absolute inset-0 bg-[#0c0d14]/90 z-10 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
            </div>
          )}

          <div
            ref={terminalContainerRef}
            className="w-full h-full overflow-hidden"
          />
        </div>

        {/* Bottom Action Bar */}
        <div className="px-4 py-2.5 bg-[#161824] border-t border-neutral-800 flex items-center justify-between text-xs">
          <div>
            {hasFiles && (
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{topDetected.frameworkLabel}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!hasFiles || !projectId || isInitializingSession || isFinalizing}
              onClick={handleOpenProjectInEditor}
              className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                hasFiles && projectId
                  ? "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white"
                  : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              }`}
            >
              {isFinalizing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Opening...</span>
                </>
              ) : (
                <>
                  <span>Open Editor</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="px-4 py-2 bg-rose-950/60 border-t border-rose-900 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
