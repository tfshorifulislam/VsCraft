"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ArrowRight, RefreshCw } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { apiFetch } from "@/lib/api";

interface TerminalProps {
  projectId: string;
  onOpenEditor: () => void;
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export default function Terminal({ projectId, onOpenEditor }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily:
        '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: "#1e1e1e",
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
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    const safeFit = () => {
      try {
        fit.fit();
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: "resize",
              cols: term.cols,
              rows: term.rows,
            })
          );
        }
      } catch {
        // Fit can fail before the element has layout.
      }
    };

    requestAnimationFrame(safeFit);

    resizeObserver = new ResizeObserver(() => safeFit());
    resizeObserver.observe(container);

    term.writeln("\x1b[38;5;245mConnecting to terminal…\x1b[0m");

    let socket: WebSocket | null = null;

    (async () => {
      try {
        const { token } = await apiFetch<{ token: string }>(
          "/api/auth/ws-token"
        );
        if (disposed) return;

        const baseUrl =
          process.env.NEXT_PUBLIC_TERMINAL_WS_URL ||
          "ws://localhost:4000/terminal";
        const url = `${baseUrl}?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId)}`;

        socket = new WebSocket(url);
        socketRef.current = socket;

        socket.onopen = () => {
          if (disposed) return;
          setState("connected");
          safeFit();
        };

        socket.onmessage = (event) => {
          let message: {
            type?: string;
            data?: string;
            message?: string;
            exitCode?: number;
            updated?: number;
            deleted?: number;
          };
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }

          if (message.type === "output" && typeof message.data === "string") {
            term.write(message.data);
          } else if (message.type === "sync" && message.updated) {
            term.write(
              `\r\n\x1b[38;5;244m[codefigma] synced ${message.updated} file(s) to the database\x1b[0m\r\n`
            );
          } else if (message.type === "exit") {
            term.writeln(
              `\r\n\x1b[38;5;244m[process exited with code ${message.exitCode ?? 0}]\x1b[0m`
            );
            setState("disconnected");
          } else if (message.type === "error") {
            term.writeln(
              `\r\n\x1b[31m${message.message || "Terminal error"}\x1b[0m`
            );
            setState("error");
          }
        };

        socket.onerror = () => {
          if (!disposed) setState("error");
        };

        socket.onclose = () => {
          if (!disposed) setState("disconnected");
        };

        term.onData((data) => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "input", data }));
          }
        });
      } catch {
        if (!disposed) {
          setState("error");
          term.writeln(
            "\x1b[31mUnable to authorize the terminal session.\x1b[0m"
          );
        }
      }
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      try {
        socket?.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      setState("connecting");
    };
  }, [projectId, attempt]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#2d2d2d] bg-[#252526] px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#cccccc]">Terminal</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              state === "connected"
                ? "bg-emerald-500/15 text-emerald-400"
                : state === "connecting"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-red-500/15 text-red-400"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {state === "connected"
              ? "Live PTY"
              : state === "connecting"
                ? "Connecting"
                : state === "error"
                  ? "Error"
                  : "Disconnected"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[#aaaaaa] transition hover:bg-[#37373d] hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reconnect
        </button>
      </div>

      <div className="flex-1 overflow-hidden bg-[#1e1e1e] p-3">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <div className="flex items-center justify-between border-t border-[#2d2d2d] bg-[#252526] px-4 py-3">
        <p className="text-xs text-[#8a8a8a]">
          Files created here sync to the database automatically.
        </p>
        <button
          type="button"
          onClick={onOpenEditor}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0d99ff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b87e3]"
        >
          Open Editor
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
