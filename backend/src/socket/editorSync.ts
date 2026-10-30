import type { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { verifyToken } from "../auth/verify";
import prisma from "../db/prisma";

interface SyncClient {
  ws: WebSocket;
  projectId: string;
  userId: string;
}

const rooms = new Map<string, Set<SyncClient>>();

function parseRequest(req: IncomingMessage): URL {
  const host = req.headers.host || "localhost";
  return new URL(req.url || "/", `http://${host}`);
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Optional live editor sync. Broadcasts file content patches to every other
 * client connected to the same project. No content is persisted here; the
 * canonical copy always lives in the database.
 */
export async function handleEditorSyncConnection(
  ws: WebSocket,
  req: IncomingMessage
): Promise<void> {
  const url = parseRequest(req);
  const token = url.searchParams.get("token");
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    ws.close(4400, "projectId is required");
    return;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    ws.close(4401, "unauthorized");
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: payload.userId },
    select: { id: true },
  });
  if (!project) {
    ws.close(4404, "project not found");
    return;
  }

  const client: SyncClient = {
    ws,
    projectId,
    userId: payload.userId,
  };

  let room = rooms.get(projectId);
  if (!room) {
    room = new Set();
    rooms.set(projectId, room);
  }
  room.add(client);

  send(ws, { type: "ready", projectId });

  ws.on("message", (raw) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const outgoing = {
      ...message,
      userId: payload.userId,
      at: Date.now(),
    };

    for (const peer of room ?? []) {
      if (peer.ws !== ws) send(peer.ws, outgoing);
    }
  });

  const leave = () => {
    const current = rooms.get(projectId);
    if (!current) return;
    current.delete(client);
    if (current.size === 0) rooms.delete(projectId);
  };

  ws.on("close", leave);
  ws.on("error", leave);
}
