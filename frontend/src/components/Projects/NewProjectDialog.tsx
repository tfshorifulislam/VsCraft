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

export default function NewProjectDialog({
  isOpen,
  onClose,
  onCreated,
}: NewProjectDialogProps) {
  const router = useRouter();

  // Session state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isInitializingSession, setIsInitializingSession] = useState(false);

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

  // Refresh project detection helper
  const refreshDetection = useCallback(async (targetId: string) => {
    try {
      const detected = await cloudApi.terminal.detect(targetId);
      setDetectedProjects(detected);
    } catch (err) {
      console.warn("Detection check failed:", err);
    }
  }, []);

  // Initialize terminal session and setup genuine xterm emulator
  useEffect(() => {
    if (!isOpen) {
      // Cleanup on close
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      if (xtermRef.current) xtermRef.current.dispose();
      wsRef.current = null;
      xtermRef.current = null;
      fitAddonRef.current = null;
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
        if (!isMounted) return;

        setProjectId(session.projectId);
        const sessId = session.sessionId || `pty_init_${Date.now()}`;
        setIsInitializingSession(false);

        // Mount xterm after container element is rendered
        setTimeout(() => {
          if (!isMounted || !terminalContainerRef.current) return;

          terminalContainerRef.current.innerHTML = "";

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
            term.focus();
          } catch {}

          xtermRef.current = term;
          fitAddonRef.current = fitAddon;

          // Connect WebSocket to persistent PTY process
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const hostname = window.location.hostname || "localhost";
          const wsPort = session.wsPort || 3005;
          const wsUrl = `${protocol}//${hostname}:${wsPort}?projectId=${encodeURIComponent(session.projectId)}&sessionId=${encodeURIComponent(sessId)}`;

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
                    term.write(msg.buffer);
                  }
                } else if (msg.type === "output" && typeof msg.data === "string") {
                  term.write(msg.data);
                  refreshDetection(session.projectId);
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
                cloudApi.terminal.sendSessionInput(session.projectId, sessId, data);
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
          refreshDetection(session.projectId);

          // Periodic detection check every 2.5 seconds
          detectionIntervalRef.current = setInterval(() => {
            if (session.projectId) {
              refreshDetection(session.projectId);
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
      if (wsRef.current) wsRef.current.close();
      if (xtermRef.current) xtermRef.current.dispose();
      wsRef.current = null;
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [isOpen, refreshDetection]);

  // Window resize handler
  useEffect(() => {
    const onResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {}
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Finalize and Open in Editor
  const handleOpenProjectInEditor = async () => {
    if (!projectId) return;
    setIsFinalizing(true);
    setErrorMsg(null);

    try {
      const topProject = detectedProjects[0];
      const subfolder = topProject && topProject.path ? topProject.path : undefined;

      const result = await cloudApi.terminal.finalize(projectId, {
        name: topProject?.name || "cloud-app",
        subfolder,
      });

      onClose();
      if (onCreated) {
        onCreated(result.projectId);
      } else {
        router.push(result.redirectUrl || `/editor/${result.projectId}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to finalize project setup";
      setErrorMsg(msg);
      setIsFinalizing(false);
    }
  };

  // Safe Cancel and Cleanup
  const handleCancel = async () => {
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
      onClick={handleCancel}
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

        {/* Pure xterm.js Terminal Window Container */}
        <div
          onContextMenu={handleContextMenu}
          className="flex-1 min-h-[360px] max-h-[520px] p-2.5 bg-[#0c0d14] relative overflow-hidden cursor-text select-text"
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
              disabled={!hasFiles || isFinalizing}
              onClick={handleOpenProjectInEditor}
              className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                hasFiles
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
                  <span>Open in Editor</span>
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
