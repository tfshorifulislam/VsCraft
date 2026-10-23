import { WebSocketServer, WebSocket } from "ws";
import {
  getPtySession,
  createPtySession,
  listPtySessions,
  writePtySession,
  resizePtySession,
  sendPtySignal,
  PtySession,
} from "./terminalPtyManager";

let wssInstance: WebSocketServer | null = null;
let currentBoundPort: number = 3005;

/**
 * Returns the currently active WebSocket port or null if not yet started.
 */
export function getTerminalWSPort(): number {
  return currentBoundPort;
}

/**
 * Initializes or returns the singleton WebSocket server for interactive PTY terminal sessions.
 */
export function getOrCreateTerminalWSServer(): WebSocketServer {
  if (wssInstance) {
    return wssInstance;
  }

  const preferredPort = parseInt(process.env.TERMINAL_WS_PORT || "3005", 10);

  const startServerOnPort = (port: number) => {
    try {
      const server = new WebSocketServer({ port });
      currentBoundPort = port;
      wssInstance = server;

      server.on("listening", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          currentBoundPort = addr.port;
        }
      });

      server.on("connection", (ws: WebSocket, req) => {
        const url = new URL(req.url || "", "http://localhost");
        const projectId = url.searchParams.get("projectId") || "";
        let sessionId = url.searchParams.get("sessionId") || "";

        if (!projectId) {
          ws.send(JSON.stringify({ type: "error", data: "Missing projectId parameter.\r\n" }));
          ws.close();
          return;
        }

        // Retrieve or create persistent PTY session
        let session: PtySession | undefined = sessionId
          ? getPtySession(projectId, sessionId)
          : undefined;

        if (!session) {
          const sessions = listPtySessions(projectId);
          session = sessions.length > 0
            ? getPtySession(projectId, sessions[0].id)
            : createPtySession(projectId);
        }

        if (!session) {
          session = createPtySession(projectId);
        }

        sessionId = session.id;

        // 1. Send session metadata and replayed buffer
        ws.send(
          JSON.stringify({
            type: "init",
            sessionId: session.id,
            name: session.name,
            shellType: session.shellType,
            buffer: session.outputBuffer.join(""),
          })
        );

        // 2. Attach real-time PTY output broadcaster
        const onPtyData = (chunk: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "output", data: chunk }));
          }
        };

        const onSyncData = (updatedFiles: unknown) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "sync", updatedFiles }));
          }
        };

        session.listeners.add(onPtyData);
        session.syncListeners.add(onSyncData);

        // 3. Handle incoming client events (raw typing, resize, signals)
        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString("utf-8"));

            if (msg.type === "input" && typeof msg.data === "string") {
              writePtySession(projectId, sessionId, msg.data);
            } else if (msg.type === "resize") {
              const cols = typeof msg.cols === "number" ? msg.cols : 80;
              const rows = typeof msg.rows === "number" ? msg.rows : 24;
              resizePtySession(projectId, sessionId, cols, rows);
            } else if (msg.type === "kill" || msg.type === "signal") {
              sendPtySignal(projectId, sessionId, "SIGINT");
            }
          } catch (err) {
            console.warn("WebSocket parse error:", err);
          }
        });

        // 4. Detach listeners on disconnect (shell stays alive!)
        ws.on("close", () => {
          session?.listeners.delete(onPtyData);
          session?.syncListeners.delete(onSyncData);
        });

        ws.on("error", (err) => {
          console.warn("WebSocket client error:", err);
          session?.listeners.delete(onPtyData);
          session?.syncListeners.delete(onSyncData);
        });
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.log(`Port ${port} in use, trying port ${port + 1}...`);
          server.close();
          startServerOnPort(port + 1);
        } else {
          console.error("Terminal WebSocket server error:", err);
        }
      });

      return server;
    } catch (e) {
      console.warn("Failed to bind WebSocket server on port", port, e);
      return startServerOnPort(port + 1);
    }
  };

  return startServerOnPort(preferredPort);
}
