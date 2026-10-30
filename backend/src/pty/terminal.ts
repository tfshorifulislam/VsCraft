import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { IncomingMessage } from "http";
import { WebSocket } from "ws";
import * as nodePty from "@homebridge/node-pty-prebuilt-multiarch";
import { config } from "../config";
import prisma from "../db/prisma";
import { verifyToken } from "../auth/verify";
import {
  materializeProjectFiles,
  syncDirectoryToDatabase,
  type FileBaseline,
} from "../services/fileSync";

interface TerminalSession {
  id: string;
  dir: string;
  homeDir: string;
  ws: WebSocket;
  pty: nodePty.IPty;
  baseline: FileBaseline;
  timer: NodeJS.Timeout;
  closed: boolean;
}

const sessions = new Map<string, TerminalSession>();

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function safeSync(session: TerminalSession): Promise<void> {
  try {
    const result = await syncDirectoryToDatabase(
      session.id,
      session.dir,
      session.baseline
    );
    session.baseline = result.baseline;
    if (result.updated || result.deleted) {
      send(session.ws, {
        type: "sync",
        updated: result.updated,
        deleted: result.deleted,
      });
    }
  } catch (error) {
    console.error("[terminal] file sync failed:", error);
  }
}

async function cleanup(session: TerminalSession): Promise<void> {
  if (session.closed) return;
  session.closed = true;
  sessions.delete(session.id);

  clearInterval(session.timer);

  try {
    session.pty.kill();
  } catch {
    // Process may already be gone.
  }

  await safeSync(session);

  try {
    await fs.rm(session.dir, { recursive: true, force: true });
    await fs.rm(session.homeDir, { recursive: true, force: true });
  } catch {
    // Best-effort ephemeral cleanup.
  }

  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.close(1000, "session ended");
  }
}

function parseRequest(req: IncomingMessage): URL {
  const host = req.headers.host || "localhost";
  return new URL(req.url || "/", `http://${host}`);
}

export async function handleTerminalConnection(
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

  let session: TerminalSession | null = null;
  let tempDir: string | null = null;
  let tempHome: string | null = null;

  try {
    const id = projectId;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codefigma-"));
    tempDir = dir;
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefigma-home-"));
    tempHome = homeDir;
    const baseline = await materializeProjectFiles(projectId, dir);

    // Never expose the server's secrets (DATABASE_URL, JWT_SECRET, ...) to the
    // interactive shell. Only pass the minimum environment a shell needs.
    const pty = nodePty.spawn(config.terminalShell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: dir,
      env: {
        PATH:
          process.env.PATH ||
          "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        HOME: homeDir,
        USER: "codefigma",
        LOGNAME: "codefigma",
        SHELL: config.terminalShell,
        LANG: process.env.LANG || "en_US.UTF-8",
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TMPDIR: homeDir,
        NPM_CONFIG_CACHE: path.join(homeDir, ".npm"),
        CODEFIGMA_PROJECT_ID: projectId,
      },
    });

    session = {
      id,
      dir,
      homeDir,
      ws,
      pty,
      baseline,
      timer: setInterval(() => {
        if (session) void safeSync(session);
      }, config.syncIntervalMs),
      closed: false,
    };
    sessions.set(id, session);

    send(ws, { type: "ready", projectId, cwd: "/workspace" });

    pty.onData((data) => {
      send(ws, { type: "output", data });
    });

    pty.onExit(({ exitCode }) => {
      send(ws, { type: "exit", exitCode });
      if (session) void cleanup(session);
    });

    ws.on("message", (raw) => {
      if (!session) return;
      let message: {
        type?: string;
        data?: string;
        cols?: number;
        rows?: number;
      };
      try {
        message = JSON.parse(raw.toString());
      } catch {
        session.pty.write(raw.toString());
        return;
      }

      switch (message.type) {
        case "input":
          if (typeof message.data === "string") session.pty.write(message.data);
          break;
        case "resize":
          if (message.cols && message.rows) {
            try {
              session.pty.resize(message.cols, message.rows);
            } catch {
              // Ignore resize races with process exit.
            }
          }
          break;
        case "sync":
          void safeSync(session);
          break;
        case "ping":
          send(ws, { type: "pong" });
          break;
        default:
          break;
      }
    });

    ws.on("close", () => {
      if (session) void cleanup(session);
    });

    ws.on("error", () => {
      if (session) void cleanup(session);
    });
  } catch (error) {
    console.error("[terminal] failed to start session:", error);
    send(ws, {
      type: "error",
      message: "Failed to start terminal session.",
    });
    if (session) {
      await cleanup(session);
    } else {
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      if (tempHome) await fs.rm(tempHome, { recursive: true, force: true }).catch(() => undefined);
    }
    ws.close(1011, "terminal failure");
  }
}

export async function shutdownAllTerminals(): Promise<void> {
  await Promise.all(Array.from(sessions.values()).map((session) => cleanup(session)));
}
