import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth";
import { getProjectById } from "../services/projectService";
import {
  ensureWorkspaceOnDisk,
  resolveSafePath,
  syncDiskToDatabase,
} from "../services/workspaceDisk";
import {
  spawnCommandStream,
  resolveCd,
  getSessionCwd,
  setSessionCwd,
  writeStdin,
  isProcessRunning,
  killSessionProcess,
} from "../services/terminalProcessManager";
import {
  listPtySessions,
  createPtySession,
  renamePtySession,
  getAvailableShells,
  getPtySession,
  writePtySession,
  resizePtySession,
  sendPtySignal,
  PtySession,
} from "../services/terminalPtyManager";
import {
  getOrCreateTerminalWSServer,
  getTerminalWSPort,
} from "../services/terminalWebSocketServer";
import { getSanitizedWorkspaceEnv } from "../services/workspaceEnv";
import { ShellType } from "../types/editor";
import { exec } from "child_process";
import fsp from "fs/promises";
import path from "path";

const router = Router();

// GET /api/projects/:id/terminal/sessions
router.get("/:id/terminal/sessions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    getOrCreateTerminalWSServer();
  } catch (err) {
    console.warn("WebSocket server start error:", err);
  }

  const sessions = listPtySessions(projectId, project.name);
  const availableShells = getAvailableShells();
  const wsPort = getTerminalWSPort();

  return res.json({
    sessions,
    availableShells,
    wsPort,
  });
});

// POST /api/projects/:id/terminal/sessions - create session
router.post("/:id/terminal/sessions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const shellType = req.body?.shellType as ShellType | undefined;
  const name = typeof req.body?.name === "string" ? req.body.name : undefined;

  const session = createPtySession(projectId, shellType, name, 80, 24, project.name);

  return res.json({
    session: {
      id: session.id,
      name: session.name,
      shellType: session.shellType,
      cwd: session.cwd,
    },
  });
});

// PATCH /api/projects/:id/terminal/sessions - rename session
router.patch("/:id/terminal/sessions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const sessionId = req.body?.sessionId as string;
  const newName = req.body?.name as string;

  if (!sessionId || !newName) {
    return res.status(400).json({ error: "Missing sessionId or name" });
  }

  const renamed = renamePtySession(projectId, sessionId, newName);
  return res.json({ success: renamed });
});

// POST /api/projects/:id/terminal/input
router.post("/:id/terminal/input", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const input = typeof req.body?.input === "string" ? req.body.input : "";
  const sessionId = req.body?.sessionId as string | undefined;

  if (sessionId) {
    const sent = writePtySession(projectId, sessionId, input);
    return res.json({ success: sent });
  }

  if (!isProcessRunning(projectId)) {
    return res.status(400).json({ error: "No active process accepting stdin." });
  }

  const sent = writeStdin(projectId, input);
  return res.json({ success: sent });
});

// POST /api/projects/:id/terminal/resize
router.post("/:id/terminal/resize", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const sessionId = req.body?.sessionId as string;
  const cols = typeof req.body?.cols === "number" ? req.body.cols : 80;
  const rows = typeof req.body?.rows === "number" ? req.body.rows : 24;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  const resized = resizePtySession(projectId, sessionId, cols, rows);
  return res.json({ success: resized });
});

// POST /api/projects/:id/terminal/kill
router.post("/:id/terminal/kill", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const sessionId = req.body?.sessionId as string | undefined;

  if (sessionId) {
    const killed = sendPtySignal(projectId, sessionId, "SIGINT");
    return res.json({ success: true, killed });
  }

  const wasRunning = isProcessRunning(projectId);
  const killed = await killSessionProcess(projectId);

  return res.json({
    success: true,
    wasRunning,
    killed,
  });
});

// POST /api/projects/:id/terminal - execute single command
router.post("/:id/terminal", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized." });
  }

  const workspaceDir = await ensureWorkspaceOnDisk(project);
  const rawCommand = (req.body?.command as string || "").trim();
  const currentRelativeCwd = (req.body?.cwd as string || "").replace(/\\/g, "/").replace(/^\/+/, "");

  if (!rawCommand) {
    return res.json({ stdout: "", stderr: "", exitCode: 0, cwd: currentRelativeCwd });
  }

  let effectiveDir = workspaceDir;
  if (currentRelativeCwd) {
    try {
      effectiveDir = resolveSafePath(projectId, currentRelativeCwd);
    } catch {
      effectiveDir = workspaceDir;
    }
  }

  if (rawCommand === "cd" || rawCommand === "cd ~" || rawCommand === "cd /") {
    return res.json({ stdout: "", stderr: "", exitCode: 0, cwd: "" });
  }

  if (rawCommand.startsWith("cd ")) {
    const targetArg = rawCommand.slice(3).trim().replace(/^["']|["']$/g, "");
    if (!targetArg || targetArg === "~" || targetArg === "/") {
      return res.json({ stdout: "", stderr: "", exitCode: 0, cwd: "" });
    }

    let nextRelative = path.posix.normalize(
      path.posix.join(currentRelativeCwd, targetArg.replace(/\\/g, "/"))
    );
    if (nextRelative.startsWith("../") || nextRelative === "..") {
      nextRelative = "";
    }

    const testPath = resolveSafePath(projectId, nextRelative);
    try {
      const stat = await fsp.stat(testPath);
      if (!stat.isDirectory()) {
        return res.json({
          stdout: "",
          stderr: `cd: not a directory: ${targetArg}\n`,
          exitCode: 1,
          cwd: currentRelativeCwd,
        });
      }
      return res.json({
        stdout: "",
        stderr: "",
        exitCode: 0,
        cwd: nextRelative === "." ? "" : nextRelative,
      });
    } catch {
      return res.json({
        stdout: "",
        stderr: `cd: no such file or directory: ${targetArg}\n`,
        exitCode: 1,
        cwd: currentRelativeCwd,
      });
    }
  }

  if (rawCommand === "pwd") {
    const displayPath = currentRelativeCwd ? `~/project/${currentRelativeCwd}` : "~/project";
    return res.json({
      stdout: `${displayPath}\n`,
      stderr: "",
      exitCode: 0,
      cwd: currentRelativeCwd,
    });
  }

  if (rawCommand === "whoami") {
    return res.json({
      stdout: `${req.user!.email}\n`,
      stderr: "",
      exitCode: 0,
      cwd: currentRelativeCwd,
    });
  }

  if (rawCommand.startsWith("touch ")) {
    const fileName = rawCommand.slice(6).trim().replace(/^["']|["']$/g, "");
    if (fileName) {
      try {
        const filePath = resolveSafePath(projectId, path.posix.join(currentRelativeCwd, fileName));
        await fsp.mkdir(path.dirname(filePath), { recursive: true });
        try {
          await fsp.appendFile(filePath, "");
        } catch {
          await fsp.writeFile(filePath, "");
        }
        const updatedFiles = await syncDiskToDatabase(projectId);
        return res.json({
          stdout: "",
          stderr: "",
          exitCode: 0,
          cwd: currentRelativeCwd,
          updatedFiles,
        });
      } catch (err) {
        return res.json({
          stdout: "",
          stderr: `touch: ${err instanceof Error ? err.message : String(err)}\n`,
          exitCode: 1,
          cwd: currentRelativeCwd,
        });
      }
    }
  }

  if (rawCommand.startsWith("mkdir ")) {
    const dirName = rawCommand.slice(6).trim().replace(/^-p\s+/i, "").replace(/^["']|["']$/g, "");
    if (dirName) {
      try {
        const dirPath = resolveSafePath(projectId, path.posix.join(currentRelativeCwd, dirName));
        await fsp.mkdir(dirPath, { recursive: true });
        const updatedFiles = await syncDiskToDatabase(projectId);
        return res.json({
          stdout: "",
          stderr: "",
          exitCode: 0,
          cwd: currentRelativeCwd,
          updatedFiles,
        });
      } catch (err) {
        return res.json({
          stdout: "",
          stderr: `mkdir: ${err instanceof Error ? err.message : String(err)}\n`,
          exitCode: 1,
          cwd: currentRelativeCwd,
        });
      }
    }
  }

  if (rawCommand.startsWith("rm ")) {
    const isRecursive = /-[rRfF]+/i.test(rawCommand);
    const target = rawCommand.replace(/^rm\s+(-[rRfF]+\s+)?/i, "").trim().replace(/^["']|["']$/g, "");
    if (target) {
      try {
        const targetPath = resolveSafePath(projectId, path.posix.join(currentRelativeCwd, target));
        await fsp.rm(targetPath, { recursive: isRecursive, force: true });
        const updatedFiles = await syncDiskToDatabase(projectId);
        return res.json({
          stdout: "",
          stderr: "",
          exitCode: 0,
          cwd: currentRelativeCwd,
          updatedFiles,
        });
      } catch (err) {
        return res.json({
          stdout: "",
          stderr: `rm: ${err instanceof Error ? err.message : String(err)}\n`,
          exitCode: 1,
          cwd: currentRelativeCwd,
        });
      }
    }
  }

  if (rawCommand.startsWith("cat ")) {
    const fileName = rawCommand.slice(4).trim().replace(/^["']|["']$/g, "");
    if (fileName) {
      try {
        const filePath = resolveSafePath(projectId, path.posix.join(currentRelativeCwd, fileName));
        const content = await fsp.readFile(filePath, "utf-8");
        return res.json({
          stdout: content.endsWith("\n") ? content : content + "\n",
          stderr: "",
          exitCode: 0,
          cwd: currentRelativeCwd,
        });
      } catch {
        return res.json({
          stdout: "",
          stderr: `cat: ${fileName}: No such file or directory\n`,
          exitCode: 1,
          cwd: currentRelativeCwd,
        });
      }
    }
  }

  if (rawCommand === "ls" || rawCommand.startsWith("ls ")) {
    const arg = rawCommand.slice(2).trim();
    const targetDir = arg
      ? resolveSafePath(projectId, path.posix.join(currentRelativeCwd, arg))
      : effectiveDir;
    try {
      const entries = await fsp.readdir(targetDir, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return res.json({
        stdout: lines.length > 0 ? lines.join("  ") + "\n" : "",
        stderr: "",
        exitCode: 0,
        cwd: currentRelativeCwd,
      });
    } catch {
      return res.json({
        stdout: "",
        stderr: `ls: cannot access '${arg}': No such file or directory\n`,
        exitCode: 1,
        cwd: currentRelativeCwd,
      });
    }
  }

  const isWindows = process.platform === "win32";
  exec(
    rawCommand,
    {
      cwd: effectiveDir,
      shell: isWindows ? "powershell.exe" : "/bin/sh",
      env: getSanitizedWorkspaceEnv(projectId, effectiveDir),
      timeout: 25000,
      maxBuffer: 1024 * 1024 * 5,
    },
    async (error, stdout, stderr) => {
      const exitCode = error ? (error.code ?? 1) : 0;
      const isFsModifying = /(echo|npm|npx|node|python|git|curl|wget)/i.test(rawCommand);
      let updatedFiles = undefined;

      if (isFsModifying) {
        try {
          updatedFiles = await syncDiskToDatabase(projectId);
        } catch (syncErr) {
          console.error("Post-command sync error:", syncErr);
        }
      }

      return res.json({
        stdout: stdout || "",
        stderr: stderr || (error && !stderr ? error.message + "\n" : ""),
        exitCode,
        cwd: currentRelativeCwd,
        updatedFiles,
      });
    }
  );
});

// POST /api/projects/:id/terminal/stream - Server-Sent Events stream
router.post("/:id/terminal/stream", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  await ensureWorkspaceOnDisk(project);

  const rawCommand = typeof req.body?.command === "string" ? req.body.command.trim() : "";
  const sessionId = req.body?.sessionId as string | undefined;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (sessionId) {
    let session = getPtySession(projectId, sessionId);
    if (!session) {
      session = createPtySession(projectId, undefined, undefined, 80, 24, project.name);
    }

    const currentSession: PtySession = session;

    if (rawCommand) {
      writePtySession(projectId, currentSession.id, rawCommand.endsWith("\r\n") ? rawCommand : rawCommand + "\r\n");
    }

    if (currentSession.outputBuffer.length > 0) {
      sendEvent({
        type: "output",
        data: currentSession.outputBuffer.join(""),
      });
    }

    const onData = (chunk: string) => {
      sendEvent({ type: "output", data: chunk });
    };

    const onSync = (updatedFiles: unknown) => {
      sendEvent({ type: "sync", updatedFiles });
    };

    currentSession.listeners.add(onData);
    currentSession.syncListeners.add(onSync);

    req.on("close", () => {
      currentSession.listeners.delete(onData);
      currentSession.syncListeners.delete(onSync);
    });
    return;
  }

  const requestedCwd = typeof req.body?.cwd === "string" ? req.body.cwd : getSessionCwd(projectId);

  if (!rawCommand) {
    sendEvent({ error: "Command is required" });
    res.end();
    return;
  }

  if (rawCommand === "cd" || rawCommand === "cd ~" || rawCommand === "cd /") {
    setSessionCwd(projectId, "");
    sendEvent({ type: "cwd", cwd: "" });
    sendEvent({ type: "exit", exitCode: 0, cwd: "" });
    res.end();
    return;
  }

  if (rawCommand.startsWith("cd ")) {
    const targetArg = rawCommand.slice(3).trim();
    const cdResult = await resolveCd(projectId, targetArg, requestedCwd);
    if (cdResult.success) {
      sendEvent({ type: "cwd", cwd: cdResult.newCwd });
      sendEvent({ type: "exit", exitCode: 0, cwd: cdResult.newCwd });
    } else {
      sendEvent({ type: "stderr", data: `${cdResult.error}\n` });
      sendEvent({ type: "exit", exitCode: 1, cwd: requestedCwd });
    }
    res.end();
    return;
  }

  const effectiveCwd = requestedCwd || getSessionCwd(projectId);
  const killProcess = spawnCommandStream(projectId, rawCommand, effectiveCwd, (event) => {
    sendEvent(event);
    if (event.type === "exit" || event.type === "error") {
      res.end();
    }
  });

  req.on("close", () => {
    if (killProcess) {
      killProcess().catch(() => {});
    }
  });
});

export default router;
