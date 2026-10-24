import type * as ptyTypes from "node-pty";
import path from "path";
import fs from "fs";
import { getWorkspaceDir, resolveSafePath, syncDiskToDatabase } from "./workspaceDisk";
import { getSanitizedWorkspaceEnv } from "./workspaceEnv";
import { ShellType, TerminalTabInfo, AvailableShell, ProjectFile } from "../types/editor";

let ptyModule: typeof import("node-pty") | null = null;
try {
  ptyModule = require("node-pty");
} catch (loadErr) {
  console.warn("[Terminal] Native node-pty module is not available in current runtime:", loadErr);
}

export interface PtySession {
  id: string;
  name: string;
  projectId: string;
  shellType: ShellType;
  shellPath: string;
  cwd: string;
  ptyProcess: ptyTypes.IPty;
  outputBuffer: string[]; // Circular replay buffer
  maxBufferSize: number;
  listeners: Set<(data: string) => void>;
  exitListeners: Set<(exitCode: number) => void>;
  syncListeners: Set<(files: ProjectFile[]) => void>;
  isAlive: boolean;
  createdAt: number;
  lastActiveAt: number;
}

// Global in-memory map of PTY sessions per project: Map<projectId, Map<sessionId, PtySession>>
const projectPtySessions = new Map<string, Map<string, PtySession>>();

/**
 * Returns available shells on the host machine.
 */
export function getAvailableShells(): AvailableShell[] {
  const isWindows = process.platform === "win32";

  if (isWindows) {
    const list: AvailableShell[] = [
      {
        type: "powershell",
        label: "PowerShell",
        path: process.env.SystemRoot
          ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
          : "powershell.exe",
      },
      {
        type: "cmd",
        label: "Command Prompt",
        path: process.env.ComSpec || "cmd.exe",
      },
    ];

    const gitBashCandidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe"),
    ];

    for (const p of gitBashCandidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
        list.push({
          type: "bash",
          label: "Git Bash",
          path: p,
        });
        break;
      }
    }

    return list;
  } else {
    const list: AvailableShell[] = [
      {
        type: "bash",
        label: "Bash",
        path: fs.existsSync("/bin/bash") ? "/bin/bash" : "/usr/bin/bash",
      },
      {
        type: "sh",
        label: "POSIX Shell",
        path: "/bin/sh",
      },
    ];

    if (fs.existsSync("/bin/zsh")) {
      list.push({
        type: "bash",
        label: "Zsh",
        path: "/bin/zsh",
      });
    }

    return list;
  }
}

/**
 * Gets or creates the map of sessions for a project.
 */
function getProjectSessions(projectId: string): Map<string, PtySession> {
  let map = projectPtySessions.get(projectId);
  if (!map) {
    map = new Map<string, PtySession>();
    projectPtySessions.set(projectId, map);
  }
  return map;
}

let sessionCounter = 0;

function sanitizePromptProjectName(value: string | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f<>:"/\\|?*%]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function resolvePromptProjectName(projectName: string | undefined, workspaceRoot: string): string {
  const fromProject = sanitizePromptProjectName(projectName);
  if (fromProject && !/^(undefined|null)$/i.test(fromProject)) {
    return fromProject;
  }

  const fromWorkspace = sanitizePromptProjectName(path.basename(workspaceRoot));
  if (fromWorkspace && !/^(undefined|null)$/i.test(fromWorkspace)) {
    return fromWorkspace;
  }

  return "project";
}

/**
 * Spawns a genuine persistent PTY shell session inside the project workspace directory.
 */
export function createPtySession(
  projectId: string,
  preferredShellType?: ShellType,
  customName?: string,
  initialCols: number = 80,
  initialRows: number = 24,
  projectName?: string
): PtySession {
  const map = getProjectSessions(projectId);
  const availableShells = getAvailableShells();
  const shellInfo = availableShells.find((s) => s.type === preferredShellType) || availableShells[0];

  const workspaceRoot = getWorkspaceDir(projectId);
  if (!fs.existsSync(workspaceRoot)) {
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }

  sessionCounter += 1;
  const sessionId = `pty_${Date.now()}_${sessionCounter}`;
  const sessionName = customName || `${map.size + 1}: ${shellInfo.type}`;

  const isWindows = process.platform === "win32";
  const promptProjectName = resolvePromptProjectName(projectName, workspaceRoot);
  let shellArgs: string[] = [];

  if (isWindows) {
    if (shellInfo.type === "powershell") {
      shellArgs = [
        "-NoLogo",
        "-NoExit",
        "-Command",
        `function prompt { $p = (Get-Location).Path; $ws = $env:WORKSPACE_ROOT; $proj = $env:PROJECT_DIR_NAME; if ($ws -and $p.StartsWith($ws, [System.StringComparison]::OrdinalIgnoreCase)) { $rel = $p.Substring($ws.Length).TrimStart('\\', '/'); if ($rel) { "PS ...\\$proj\\$rel> " } else { "PS ...\\$proj> " } } else { $leaf = Split-Path $p -Leaf; if ($leaf.Length -gt 13) { $leaf = $leaf.Substring(0, 11) }; "PS ...\\$leaf> " } }`,
      ];
    } else if (shellInfo.type === "cmd") {
      shellArgs = ["/k", `prompt ...\\${promptProjectName}$G`];
    } else if (shellInfo.type === "bash") {
      shellArgs = ["--login", "-i"];
    }
  } else {
    shellArgs = ["-i"];
  }

  if (!ptyModule) {
    throw new Error(
      "Persistent interactive terminal is not supported in the current serverless runtime. Please run within a containerized environment (Docker, Railway, Render, or Fly.io) with native PTY support."
    );
  }

  // Spawn real persistent PTY process
  const ptyProcess = ptyModule.spawn(shellInfo.path, shellArgs, {
    name: "xterm-256color",
    cols: Math.max(initialCols, 40),
    rows: Math.max(initialRows, 10),
    cwd: workspaceRoot,
    env: getSanitizedWorkspaceEnv(projectId, workspaceRoot, {
      PROJECT_DIR_NAME: promptProjectName,
      PROMPT: `...\\${promptProjectName}$G`,
      PS1: `.../${promptProjectName}$ `,
    }),
    useConpty: false, // winpty provides rock-solid reliability across all Windows environments
  });

  const session: PtySession = {
    id: sessionId,
    name: sessionName,
    projectId,
    shellType: shellInfo.type,
    shellPath: shellInfo.path,
    cwd: "",
    ptyProcess,
    outputBuffer: [],
    maxBufferSize: 1000,
    listeners: new Set(),
    exitListeners: new Set(),
    syncListeners: new Set(),
    isAlive: true,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  // Debounced filesystem synchronizer triggered by terminal operations
  let syncTimeout: NodeJS.Timeout | null = null;
  const triggerDiskSync = () => {
    if (!session.isAlive) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      try {
        if (!session.isAlive) return;
        const updatedFiles = await syncDiskToDatabase(projectId);
        session.syncListeners.forEach((fn) => fn(updatedFiles));
      } catch (err) {
        console.warn("PTY automatic disk sync error:", err);
      }
    }, 400);
  };

  // Wire raw PTY data stream
  ptyProcess.onData((data: string) => {
    session.lastActiveAt = Date.now();

    // Store in circular buffer for tab switching and reconnection
    session.outputBuffer.push(data);
    if (session.outputBuffer.length > session.maxBufferSize) {
      session.outputBuffer.shift();
    }

    // Broadcast raw chunk to all attached listeners (WebSockets or HTTP streams)
    session.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.warn("PTY listener error:", err);
      }
    });

    // Check if output indicates filesystem operations
    if (/(touch|mkdir|rm|Created|Writing|Installed|added \d+ packages|modified)/i.test(data)) {
      triggerDiskSync();
    }
  });

  // Wire process exit
  ptyProcess.onExit(({ exitCode }) => {
    session.isAlive = false;
    session.exitListeners.forEach((fn) => {
      try {
        fn(exitCode);
      } catch {}
    });
    // Trigger final disk sync
    triggerDiskSync();
  });

  map.set(sessionId, session);
  return session;
}

/**
 * Returns a list of all active PTY session tabs for a project.
 */
export function listPtySessions(projectId: string, projectName?: string): TerminalTabInfo[] {
  const map = getProjectSessions(projectId);

  if (map.size === 0) {
    createPtySession(projectId, undefined, undefined, 80, 24, projectName);
  }

  const result: TerminalTabInfo[] = [];
  for (const session of map.values()) {
    result.push({
      id: session.id,
      name: session.name,
      shellType: session.shellType,
      cwd: session.cwd,
      isRunning: session.isAlive,
    });
  }

  return result;
}

/**
 * Gets a specific PTY session.
 */
export function getPtySession(projectId: string, sessionId: string): PtySession | undefined {
  const map = getProjectSessions(projectId);
  return map.get(sessionId);
}

/**
 * Writes raw data (keystrokes, text, control sequences) directly to the persistent PTY process.
 */
export function writePtySession(projectId: string, sessionId: string, data: string): boolean {
  const session = getPtySession(projectId, sessionId);
  if (!session || !session.isAlive) return false;

  try {
    session.lastActiveAt = Date.now();
    session.ptyProcess.write(data);
    return true;
  } catch (err) {
    console.warn("Failed to write to PTY process:", err);
    return false;
  }
}

/**
 * Resizes the PTY process geometry (columns & rows).
 */
export function resizePtySession(projectId: string, sessionId: string, cols: number, rows: number): boolean {
  const session = getPtySession(projectId, sessionId);
  if (!session || !session.isAlive) return false;

  try {
    const validCols = Math.max(Math.floor(cols), 10);
    const validRows = Math.max(Math.floor(rows), 4);
    session.ptyProcess.resize(validCols, validRows);
    return true;
  } catch (err) {
    console.warn("Failed to resize PTY process:", err);
    return false;
  }
}

/**
 * Sends a signal (e.g. SIGINT / Ctrl+C) to the foreground process in the PTY session.
 */
export function sendPtySignal(projectId: string, sessionId: string, signal: "SIGINT" | "SIGTERM" = "SIGINT"): boolean {
  const session = getPtySession(projectId, sessionId);
  if (!session || !session.isAlive) return false;

  try {
    if (signal === "SIGINT") {
      // Send standard ASCII ETX (\x03)
      session.ptyProcess.write("\x03");
    } else {
      session.ptyProcess.kill(signal);
    }
    return true;
  } catch (err) {
    console.warn("Failed to send signal to PTY process:", err);
    return false;
  }
}

/**
 * Renames a PTY session tab.
 */
export function renamePtySession(projectId: string, sessionId: string, newName: string): boolean {
  const session = getPtySession(projectId, sessionId);
  if (!session) return false;
  session.name = newName.trim() || session.name;
  return true;
}

/**
 * Closes and terminates a PTY session tab.
 */
export function closePtySession(projectId: string, sessionId: string): boolean {
  const map = getProjectSessions(projectId);
  const session = map.get(sessionId);
  if (!session) return false;

  session.isAlive = false;
  try {
    session.ptyProcess.kill();
  } catch {}

  map.delete(sessionId);
  return true;
}

/**
 * Closes and terminates all PTY sessions for a project.
 */
export function closeAllPtySessions(projectId: string): void {
  const map = projectPtySessions.get(projectId);
  if (map) {
    for (const session of map.values()) {
      session.isAlive = false;
      try {
        session.ptyProcess.kill();
      } catch {}
    }
    map.clear();
    projectPtySessions.delete(projectId);
  }
}
