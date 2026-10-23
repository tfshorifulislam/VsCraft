import { spawn, ChildProcess, exec } from "child_process";
import path from "path";
import fsp from "fs/promises";
import { getWorkspaceDir, resolveSafePath } from "./workspaceDisk";
import { getSanitizedWorkspaceEnv } from "./workspaceEnv";

interface ActiveProcessInfo {
  child: ChildProcess;
  pid: number;
  command: string;
  cwd: string;
  startedAt: number;
}

// Global in-memory map of active processes per project ID
const activeProcesses = new Map<string, ActiveProcessInfo>();
// Current relative working directories per project ID
const sessionCwds = new Map<string, string>();

/**
 * Gets the current relative working directory for a project session.
 */
export function getSessionCwd(projectId: string): string {
  return sessionCwds.get(projectId) || "";
}

/**
 * Sets the current relative working directory for a project session.
 */
export function setSessionCwd(projectId: string, relativeCwd: string): void {
  const normalized = relativeCwd.replace(/\\/g, "/").replace(/^\/+/, "");
  sessionCwds.set(projectId, normalized);
}

/**
 * Cross-platform process tree termination.
 * On Windows, spawns taskkill to cleanly eliminate the process and all child processes.
 * On Unix, sends SIGTERM then SIGKILL to the process group.
 */
export async function killSessionProcess(projectId: string): Promise<boolean> {
  const info = activeProcesses.get(projectId);
  if (!info) return false;

  const { child, pid } = info;
  activeProcesses.delete(projectId);

  if (process.platform === "win32") {
    try {
      await new Promise<void>((resolve) => {
        exec(`taskkill /pid ${pid} /T /F`, (err) => {
          if (err) {
            // Fallback: child.kill()
            try {
              child.kill("SIGKILL");
            } catch {}
          }
          resolve();
        });
      });
      return true;
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {}
      return true;
    }
  } else {
    try {
      // Send SIGTERM to process group if negative pid supported
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }

      // Allow 500ms then force kill
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {}
        }
      }, 500);

      return true;
    } catch {
      try {
        child.kill();
      } catch {}
      return false;
    }
  }
}

/**
 * Writes data directly into the stdin stream of an active command process.
 */
export function writeStdin(projectId: string, input: string): boolean {
  const info = activeProcesses.get(projectId);
  if (!info || !info.child || !info.child.stdin || info.child.killed) {
    return false;
  }

  try {
    const dataToWrite = input.endsWith("\n") ? input : input + "\n";
    info.child.stdin.write(dataToWrite);
    return true;
  } catch (err) {
    console.error(`Failed to write stdin for project ${projectId}:`, err);
    return false;
  }
}

/**
 * Resolves a `cd` request safely inside the project workspace sandbox.
 */
export async function resolveCd(
  projectId: string,
  targetArg: string,
  currentRelativeCwd: string
): Promise<{ success: boolean; newCwd: string; error?: string }> {
  const trimmed = targetArg.trim().replace(/^["']|["']$/g, "");

  if (!trimmed || trimmed === "~" || trimmed === "/") {
    setSessionCwd(projectId, "");
    return { success: true, newCwd: "" };
  }

  let nextRelative = path.posix.normalize(
    path.posix.join(currentRelativeCwd, trimmed.replace(/\\/g, "/"))
  );

  // Prevent escaping root
  if (nextRelative.startsWith("../") || nextRelative === "..") {
    nextRelative = "";
  }

  try {
    const testPath = resolveSafePath(projectId, nextRelative);
    const stat = await fsp.stat(testPath);
    if (!stat.isDirectory()) {
      return {
        success: false,
        newCwd: currentRelativeCwd,
        error: `cd: not a directory: ${trimmed}`,
      };
    }
    const finalCwd = nextRelative === "." ? "" : nextRelative;
    setSessionCwd(projectId, finalCwd);
    return { success: true, newCwd: finalCwd };
  } catch {
    return {
      success: false,
      newCwd: currentRelativeCwd,
      error: `cd: no such file or directory: ${trimmed}`,
    };
  }
}

export interface StreamEvent {
  type: "stdout" | "stderr" | "exit" | "cwd" | "error";
  data?: string;
  exitCode?: number;
  cwd?: string;
}

/**
 * Spawns a real shell process inside the project's workspace, streaming output in real time.
 */
export function spawnCommandStream(
  projectId: string,
  command: string,
  relativeCwd: string,
  onEvent: (event: StreamEvent) => void
): () => Promise<boolean> {
  const workspaceRoot = getWorkspaceDir(projectId);
  let effectiveDir = workspaceRoot;

  try {
    effectiveDir = relativeCwd ? resolveSafePath(projectId, relativeCwd) : workspaceRoot;
  } catch {
    effectiveDir = workspaceRoot;
  }

  const isWindows = process.platform === "win32";

  // Use cmd.exe /d /s /c on Windows or /bin/sh -c on POSIX
  const shell = isWindows ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
  const shellArgs = isWindows ? ["/d", "/s", "/c", command] : ["-c", command];

  const child = spawn(/*turbopackIgnore: true*/ shell, shellArgs, {
    cwd: effectiveDir,
    windowsVerbatimArguments: isWindows,
    env: getSanitizedWorkspaceEnv(projectId, effectiveDir, {
      NPM_CONFIG_COLOR: "always",
    }),
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (child.pid) {
    activeProcesses.set(projectId, {
      child,
      pid: child.pid,
      command,
      cwd: relativeCwd,
      startedAt: Date.now(),
    });
  }

  child.stdout?.on("data", (chunk: Buffer) => {
    onEvent({
      type: "stdout",
      data: chunk.toString("utf-8"),
    });
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    onEvent({
      type: "stderr",
      data: chunk.toString("utf-8"),
    });
  });

  child.on("error", (err: Error) => {
    activeProcesses.delete(projectId);
    onEvent({
      type: "error",
      data: `Process error: ${err.message}\n`,
      exitCode: 1,
    });
  });

  child.on("close", (code: number | null) => {
    activeProcesses.delete(projectId);
    const exitCode = code !== null ? code : 0;
    onEvent({
      type: "exit",
      exitCode,
      cwd: getSessionCwd(projectId),
    });
  });

  return () => killSessionProcess(projectId);
}

/**
 * Checks if a session currently has a running command.
 */
export function isProcessRunning(projectId: string): boolean {
  const info = activeProcesses.get(projectId);
  return Boolean(info && !info.child.killed);
}

/**
 * Gets info about current running process if any.
 */
export function getRunningProcessInfo(projectId: string): { command: string; startedAt: number } | null {
  const info = activeProcesses.get(projectId);
  if (!info || info.child.killed) return null;
  return {
    command: info.command,
    startedAt: info.startedAt,
  };
}

