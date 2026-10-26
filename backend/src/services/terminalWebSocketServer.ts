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
import { verifySessionToken } from "../auth/jwt";
import { SESSION_COOKIE_NAME } from "../auth/session";
import prisma from "../db/prisma";

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

      server.on("connection", async (ws: WebSocket, req) => {
        const url = new URL(req.url || "", "http://localhost");
        const projectId = url.searchParams.get("projectId") || "";
        let sessionId = url.searchParams.get("sessionId") || "";

        if (!projectId) {
          ws.send(JSON.stringify({ type: "error", data: "Missing projectId parameter.\r\n" }));
          ws.close(4000, "Missing projectId");
          return;
        }

        // Authenticate request: extract token from query param, cookie, or authorization header
        const cookieHeader = req.headers.cookie || "";
        const cookies: Record<string, string> = {};
        cookieHeader.split(";").forEach((c) => {
          const [k, ...v] = c.split("=");
          if (k) cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
        });

        const authHeader = req.headers.authorization;
        const authBearer = authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : null;

        const token = url.searchParams.get("token") || cookies[SESSION_COOKIE_NAME] || authBearer;
        if (!token) {
          ws.send(JSON.stringify({ type: "error", data: "Unauthorized: Missing authentication credentials.\r\n" }));
          ws.close(4001, "Unauthorized");
          return;
        }

        const payload = await verifySessionToken(token);
        if (!payload) {
          ws.send(JSON.stringify({ type: "error", data: "Unauthorized: Invalid or expired session token.\r\n" }));
          ws.close(4001, "Unauthorized");
          return;
        }

        // Verify project ownership
        const project = await prisma.project.findFirst({
          where: { id: projectId, ownerId: payload.userId },
          select: { id: true, name: true },
        });

        if (!project) {
          ws.send(JSON.stringify({ type: "error", data: "Forbidden: Project not found or unauthorized access.\r\n" }));
          ws.close(4003, "Forbidden");
          return;
        }

        // Retrieve or create persistent PTY session
        let session: PtySession | undefined = sessionId
          ? getPtySession(projectId, sessionId)
          : undefined;

        if (!session) {
          const sessions = listPtySessions(projectId, project.name);
          session = sessions.length > 0
            ? getPtySession(projectId, sessions[0].id)
            : createPtySession(projectId, undefined, undefined, 80, 24, project.name);
        }

        if (!session) {
          session = createPtySession(projectId, undefined, undefined, 80, 24, project.name);
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
