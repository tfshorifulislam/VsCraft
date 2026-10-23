import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth";
import prisma from "../db/prisma";
import {
  getUserProjects,
  createCloudProject,
  getProjectById,
  updateProjectMetadata,
  deleteProject,
  duplicateProject,
  emptyTrashForUser,
  initializeFrameworkOnProject,
} from "../services/projectService";
import {
  ensureWorkspaceOnDisk,
  syncDiskToDatabase,
  getWorkspaceDir,
} from "../services/workspaceDisk";
import {
  detectProjectsInWorkspace,
  promoteSubfolderToRoot,
} from "../services/projectDetector";
import {
  getDevServerStatus,
  startDevServer,
  stopDevServer,
  restartDevServer,
} from "../services/devServerManager";
import { compileProjectForPreview } from "../services/previewCompiler";
import { setSessionCwd, killSessionProcess } from "../services/terminalProcessManager";
import {
  createPtySession,
  closeAllPtySessions,
} from "../services/terminalPtyManager";
import {
  getOrCreateTerminalWSServer,
  getTerminalWSPort,
} from "../services/terminalWebSocketServer";
import { detectProjectFramework } from "../utils/detectFramework";
import JSZip from "jszip";
import crypto from "crypto";
import fsp from "fs/promises";

const router = Router();

function generateId(prefix: string = "f"): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
  json: "application/json",
  css: "text/css",
  js: "text/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  html: "text/html",
  md: "text/markdown",
  txt: "text/plain",
};

const IGNORED_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  ".turbo/",
  "__pycache__/",
  ".venv/",
  "venv/",
  ".idea/",
  ".vscode/",
];

const IGNORED_FILES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  ".npmrc",
  "yarn-error.log",
  "package-lock.json.bak",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "ico",
  "bmp",
  "avif",
]);

function sanitizePath(raw: string): string {
  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/\0/g, "")
    .replace(/^\/+/, "")
    .trim();

  if (
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized === ".." ||
    normalized.includes("/./")
  ) {
    throw new Error(`Unsafe path traversal detected in file path: "${raw}"`);
  }

  return normalized;
}

function isIgnored(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const fileName = lower.split("/").pop() || "";
  if (IGNORED_FILES.has(fileName)) return true;
  return IGNORED_PREFIXES.some((prefix) => lower.startsWith(prefix) || lower.includes(`/${prefix}`));
}

function getMimeType(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    case "bmp":
      return "image/bmp";
    case "avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

// GET /api/projects - list projects
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const categoryParam = (req.query.category as string) || "all";
  const category = ["all", "recent", "starred", "trash"].includes(categoryParam)
    ? (categoryParam as "all" | "recent" | "starred" | "trash")
    : "all";

  try {
    const projects = await getUserProjects(userId, category);
    return res.json({ projects });
  } catch (error) {
    console.error("Failed to fetch cloud projects:", error);
    return res.status(500).json({ error: "Failed to fetch projects." });
  }
});

// POST /api/projects - create project
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const project = await createCloudProject(userId, req.body);
    return res.status(201).json({ project });
  } catch (error) {
    console.error("Failed to create cloud project:", error);
    return res.status(500).json({ error: "Failed to create project." });
  }
});

// POST /api/projects/import - import zip or json files
router.post("/import", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  try {
    let projectName = (req.body?.name as string) || "";
    let projectDescription = (req.body?.description as string) || "";
    const extractedFiles: {
      name: string;
      path: string;
      content: string;
      isFolder: boolean;
      language?: string;
    }[] = [];

    if (req.body?.zipBase64) {
      const buffer = Buffer.from(req.body.zipBase64, "base64");
      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.keys(zip.files);
      if (entries.length === 0) {
        return res.status(400).json({ error: "The uploaded ZIP archive is empty." });
      }

      for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const sanitized = sanitizePath(rawPath);
        if (!sanitized || isIgnored(sanitized)) continue;

        const fileName = sanitized.split("/").pop() || "";
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const isImage = IMAGE_EXTENSIONS.has(ext);

        let content = "";
        if (isImage && ext !== "svg") {
          const entryBuffer = await zipEntry.async("nodebuffer");
          const mime = getMimeType(ext);
          content = `data:${mime};base64,${entryBuffer.toString("base64")}`;
        } else {
          content = await zipEntry.async("string");
        }

        extractedFiles.push({
          name: fileName,
          path: sanitized,
          content,
          isFolder: false,
          language: isImage ? "image" : ext || "plaintext",
        });
      }
    } else if (Array.isArray(req.body?.files)) {
      for (const f of req.body.files) {
        const sanitized = sanitizePath(f.path || f.name);
        if (!sanitized || isIgnored(sanitized)) continue;

        const fileName = sanitized.split("/").pop() || f.name;
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const isImage = IMAGE_EXTENSIONS.has(ext);

        extractedFiles.push({
          name: fileName,
          path: sanitized,
          content: f.content || "",
          isFolder: Boolean(f.isFolder),
          language: isImage ? "image" : ext || "plaintext",
        });
      }
    }

    if (extractedFiles.length === 0) {
      return res.status(400).json({
        error: "No valid files found to import (ignored files/dependencies may have been filtered).",
      });
    }

    const detection = detectProjectFramework(extractedFiles);
    const chosenTemplate = detection.template;

    const pkg = extractedFiles.find((f) => f.path === "package.json");
    if (pkg && !projectName) {
      try {
        const parsed = JSON.parse(pkg.content);
        if (parsed.name) projectName = parsed.name;
      } catch {
        // ignore
      }
    }

    if (!projectName.trim()) {
      projectName = "Imported Project";
    }

    const folderMap = new Map<string, string>();
    const fileRecordsToCreate: {
      id: string;
      name: string;
      path: string;
      content: string;
      language: string;
      isFolder: boolean;
      parentId: string | null;
      version: number;
    }[] = [];

    for (const file of extractedFiles) {
      const parts = file.path.split("/");
      if (parts.length > 1) {
        let running = "";
        for (let i = 0; i < parts.length - 1; i++) {
          const folderName = parts[i];
          const prev = running;
          running = running ? `${running}/${folderName}` : folderName;

          if (!folderMap.has(running)) {
            const folderId = generateId("dir");
            folderMap.set(running, folderId);
            fileRecordsToCreate.push({
              id: folderId,
              name: folderName,
              path: running,
              content: "",
              language: "",
              isFolder: true,
              parentId: prev ? folderMap.get(prev) || null : null,
              version: 1,
            });
          }
        }
      }
    }

    for (const file of extractedFiles) {
      const parts = file.path.split("/");
      let parentId: string | null = null;
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join("/");
        parentId = folderMap.get(parentPath) || null;
      }

      fileRecordsToCreate.push({
        id: generateId("f"),
        name: file.name,
        path: file.path,
        content: file.content,
        language: file.language || "plaintext",
        isFolder: file.isFolder,
        parentId,
        version: 1,
      });
    }

    const preferredFiles = [
      "src/app/page.tsx",
      "src/App.tsx",
      "src/main.tsx",
      "src/index.tsx",
      "src/index.js",
      "main.py",
      "app.py",
      "main.rs",
      "main.go",
      "index.html",
      "README.md",
      "package.json",
    ];

    let activeRecord = fileRecordsToCreate.find(
      (f) => !f.isFolder && preferredFiles.includes(f.path)
    );
    if (!activeRecord) {
      activeRecord = fileRecordsToCreate.find((f) => !f.isFolder);
    }

    const projectId = generateId("proj");
    const initialOpenIds = activeRecord ? [activeRecord.id] : [];

    const newProject = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          id: projectId,
          name: projectName,
          description:
            projectDescription ||
            `Imported ${detection.frameworkName} project (${detection.language})`,
          template: chosenTemplate,
          starred: false,
          ownerId: userId,
          activeFileId: activeRecord ? activeRecord.id : null,
          openFileIds: JSON.stringify(initialOpenIds),
        },
      });

      const chunkSize = 100;
      for (let i = 0; i < fileRecordsToCreate.length; i += chunkSize) {
        const chunk = fileRecordsToCreate.slice(i, i + chunkSize);
        await tx.projectFile.createMany({
          data: chunk.map((c) => ({
            id: c.id,
            projectId: createdProject.id,
            name: c.name,
            path: c.path,
            content: c.content,
            language: c.language,
            isFolder: c.isFolder,
            parentId: c.parentId,
            version: c.version,
          })),
        });
      }

      return createdProject;
    });

    return res.json({
      success: true,
      project: {
        ...newProject,
        createdAt: newProject.createdAt.getTime(),
        updatedAt: newProject.updatedAt.getTime(),
        openFileIds: initialOpenIds,
        filesCount: fileRecordsToCreate.length,
      },
      detection,
      message: `Successfully imported "${projectName}" with ${fileRecordsToCreate.length} items.`,
    });
  } catch (err) {
    console.error("Import project error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to import project." });
  }
});

// POST /api/projects/trash/empty
router.post("/trash/empty", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await emptyTrashForUser(userId);
    return res.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Failed to empty trash:", error);
    return res.status(500).json({ error: "Failed to empty trash." });
  }
});

// POST /api/projects/terminal-session
router.post("/terminal-session", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const rawName = (req.body?.name as string || "").trim();
    const projectName = rawName || "cloud-project";

    const project = await createCloudProject(userId, {
      type: "blank",
      blankSubtype: "empty",
      name: projectName,
      isPrivate: true,
    });

    if (!project) {
      throw new Error("Failed to create draft project.");
    }

    await ensureWorkspaceOnDisk(project);
    setSessionCwd(project.id, "");

    try {
      getOrCreateTerminalWSServer();
    } catch (err) {
      console.warn("WebSocket server start error:", err);
    }

    const ptySession = createPtySession(project.id);
    const wsPort = getTerminalWSPort();

    return res.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
      },
      session: {
        id: ptySession.id,
        name: ptySession.name,
        cwd: ptySession.cwd,
        shellType: ptySession.shellType,
      },
      wsPort,
    });
  } catch (error) {
    console.error("Failed to create terminal session project:", error);
    return res.status(500).json({ error: "Failed to initialize terminal session." });
  }
});

// GET /api/projects/:id - get project
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const project = await getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: "Project not found or unauthorized." });
    }

    try {
      await ensureWorkspaceOnDisk(project);
    } catch (diskErr) {
      console.warn("Could not synchronize workspace to disk:", diskErr);
    }

    return res.json({ project });
  } catch (error) {
    console.error("Failed to get project:", error);
    return res.status(500).json({ error: "Failed to load project." });
  }
});

// PATCH & PUT /api/projects/:id - update metadata
const updateMetadataHandler = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const updated = await updateProjectMetadata(projectId, userId, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Project not found or unauthorized." });
    }
    return res.json({ project: updated });
  } catch (error) {
    console.error("Failed to update project metadata:", error);
    return res.status(500).json({ error: "Failed to update project." });
  }
};
router.patch("/:id", requireAuth, updateMetadataHandler);
router.put("/:id", requireAuth, updateMetadataHandler);

// DELETE /api/projects/:id - delete project
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;
  const permanent = req.query.permanent === "true";

  try {
    const result = await deleteProject(projectId, userId, permanent);
    if (!result) {
      return res.status(404).json({ error: "Project not found or unauthorized." });
    }
    return res.json({ success: true, permanent });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return res.status(500).json({ error: "Failed to delete project." });
  }
});

// POST /api/projects/:id/duplicate
router.post("/:id/duplicate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const duplicated = await duplicateProject(projectId, userId);
    if (!duplicated) {
      return res.status(404).json({ error: "Source project not found or unauthorized." });
    }
    return res.status(201).json({ project: duplicated });
  } catch (error) {
    console.error("Failed to duplicate project:", error);
    return res.status(500).json({ error: "Failed to duplicate project." });
  }
});

// POST /api/projects/:id/check
router.post("/:id/check", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized." });
  }

  const diagnostics: { file: string; line: number; message: string; severity: "error" | "warning" }[] = [];

  const pkgFile = project.files.find((f) => f.path === "package.json");
  if (!pkgFile) {
    diagnostics.push({ file: "package.json", line: 1, message: "Missing package.json in workspace root.", severity: "error" });
  }

  const tsconfigFile = project.files.find((f) => f.path === "tsconfig.json");
  if (!tsconfigFile) {
    diagnostics.push({ file: "tsconfig.json", line: 1, message: "Missing tsconfig.json in workspace root.", severity: "error" });
  }

  return res.json({ diagnostics });
});

// POST /api/projects/:id/cleanup
router.post("/:id/cleanup", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.json({ success: true });
  }

  closeAllPtySessions(projectId);
  await killSessionProcess(projectId);

  try {
    const dir = getWorkspaceDir(projectId);
    await fsp.rm(dir, { recursive: true, force: true });
  } catch (err) {
    console.warn("Failed to remove workspace folder during cleanup:", err);
  }

  try {
    await deleteProject(projectId, userId, true);
  } catch (err) {
    console.warn("Failed to delete draft project during cleanup:", err);
  }

  return res.json({ success: true });
});

// GET /api/projects/:id/detect
router.get("/:id/detect", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const detected = await detectProjectsInWorkspace(projectId);
    return res.json({ detected });
  } catch (error) {
    console.error("Project detection error:", error);
    return res.status(500).json({ error: "Failed to detect project workspace." });
  }
});

// POST /api/projects/:id/initialize
router.post("/:id/initialize", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const body = req.body;
    if (!body || !body.type) {
      return res.status(400).json({ error: "Initialization type is required." });
    }

    const updatedProject = await initializeFrameworkOnProject(projectId, userId, body);
    if (!updatedProject) {
      return res.status(404).json({ error: "Project not found or unauthorized." });
    }

    return res.json({ project: updatedProject, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to initialize framework.";
    console.error("Initialize framework error:", error);
    return res.status(500).json({ error: message });
  }
});

// POST /api/projects/:id/finalize
router.post("/:id/finalize", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const customName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const subfolder = typeof req.body?.subfolder === "string" ? req.body.subfolder.trim() : "";

  try {
    if (subfolder && subfolder !== "." && subfolder !== "/") {
      await promoteSubfolderToRoot(projectId, subfolder);
    }

    const detectedList = await detectProjectsInWorkspace(projectId);
    const primary = detectedList[0];
    const detectedTemplate = primary?.template || "blank";
    const detectedName = customName || primary?.name || project.name;
    const entryFileRelPath = primary?.entryFile;

    const syncedFiles = await syncDiskToDatabase(projectId);

    let activeFileId: string | null = null;
    let openFileIds: string[] = [];

    if (entryFileRelPath) {
      const match = syncedFiles.find(
        (f) => !f.isFolder && (f.path === entryFileRelPath || f.path.endsWith("/" + entryFileRelPath))
      );
      if (match) {
        activeFileId = match.id;
        openFileIds = [match.id];
      }
    }

    if (!activeFileId && syncedFiles.length > 0) {
      const firstNonFolder = syncedFiles.find((f) => !f.isFolder);
      if (firstNonFolder) {
        activeFileId = firstNonFolder.id;
        openFileIds = [firstNonFolder.id];
      }
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: detectedName,
        template: detectedTemplate,
        activeFileId,
        openFileIds: JSON.stringify(openFileIds),
      },
    });

    return res.json({
      success: true,
      project: {
        ...updatedProject,
        createdAt: updatedProject.createdAt.getTime(),
        updatedAt: updatedProject.updatedAt.getTime(),
        openFileIds,
        files: syncedFiles,
      },
      primaryDetected: primary,
    });
  } catch (err) {
    console.error("Finalize error:", err);
    return res.status(500).json({ error: "Failed to finalize project." });
  }
});

// GET /api/projects/:id/preview
router.get("/:id/preview", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(404).send("<!DOCTYPE html><html><body><div style='padding:20px;font-family:sans-serif;color:#ef4444;'>Project not found or unauthorized.</div></body></html>");
  }

  await ensureWorkspaceOnDisk(project).catch((err) => console.error("Workspace disk sync warning:", err));

  const result = await compileProjectForPreview(project);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.send(result.html);
});

// GET /api/projects/:id/raw
router.get("/:id/raw", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const projectId = req.params.id;
  const rawPath = req.query.path as string;
  const fileId = req.query.fileId as string;

  if (!rawPath && !fileId) {
    return res.status(400).json({ error: "Missing 'path' or 'fileId' query parameter." });
  }

  const userId = req.user!.id;
  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized." });
  }

  const normalizedPath = rawPath ? rawPath.replace(/^\/+/, "").replace(/\\/g, "/") : "";

  const file = project.files.find(
    (f) =>
      (!f.isFolder && fileId && f.id === fileId) ||
      (!f.isFolder && normalizedPath && f.path.replace(/^\/+/, "") === normalizedPath)
  );

  if (!file) {
    return res.status(404).json({ error: `File not found: ${rawPath || fileId}` });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const contentType = MIME_MAP[ext] || "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);

  if (file.content.startsWith("data:") && file.content.includes(";base64,")) {
    const commaIndex = file.content.indexOf(",");
    const base64Data = file.content.slice(commaIndex + 1);
    const buffer = Buffer.from(base64Data, "base64");
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    return res.send(buffer);
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.send(file.content);
});

// GET /api/projects/:id/server
router.get("/:id/server", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized." });
  }

  const status = getDevServerStatus(projectId);
  return res.json({ server: status });
});

// POST /api/projects/:id/server
router.post("/:id/server", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized." });
  }

  const action = (req.body?.action as string) || "start";

  try {
    if (action === "stop") {
      await stopDevServer(projectId);
      return res.json({
        server: { status: "stopped", logs: ["[DevServer] Stopped by user."] },
      });
    }

    if (action === "restart") {
      const restarted = await restartDevServer(projectId);
      return res.json({
        server: {
          status: restarted.status,
          port: restarted.port,
          url: restarted.url,
          framework: restarted.framework,
          logs: restarted.logs,
          error: restarted.error,
        },
      });
    }

    const instance = await startDevServer(projectId);
    return res.json({
      server: {
        status: instance.status,
        port: instance.port,
        url: instance.url,
        framework: instance.framework,
        logs: instance.logs,
        error: instance.error,
      },
    });
  } catch (err) {
    console.error("Dev server action error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to execute dev server action.",
    });
  }
});

// POST /api/projects/:id/sync
router.post("/:id/sync", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized." });
  }

  try {
    await ensureWorkspaceOnDisk(project);
    const files = await syncDiskToDatabase(projectId);
    return res.json({
      success: true,
      files,
      message: `Synchronized ${files.length} workspace files.`,
    });
  } catch (error: unknown) {
    console.error("Workspace sync error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to sync workspace.",
    });
  }
});

// POST /api/projects/:id/upload
router.post("/:id/upload", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized." });
  }

  try {
    let incomingFiles: {
      name: string;
      path: string;
      content: string;
    }[] = [];

    if (Array.isArray(req.body?.files)) {
      incomingFiles = req.body.files;
    } else if (req.body?.name && req.body?.content !== undefined) {
      incomingFiles = [req.body];
    }

    if (incomingFiles.length === 0) {
      return res.status(400).json({ error: "No files received." });
    }

    const createdFiles: any[] = [];

    await prisma.$transaction(async (tx) => {
      const existingProject = await tx.project.findUnique({
        where: { id: projectId },
        include: { files: true },
      });

      if (!existingProject) {
        throw new Error("Project not found");
      }

      const folderMap = new Map<string, string>();
      for (const f of existingProject.files) {
        if (f.isFolder) {
          folderMap.set(f.path, f.id);
        }
      }

      for (const incoming of incomingFiles) {
        const sanitized = sanitizePath(incoming.path);
        const parts = sanitized.split("/");

        if (parts.length > 1) {
          let running = "";
          for (let i = 0; i < parts.length - 1; i++) {
            const folderName = parts[i];
            const prev = running;
            running = running ? `${running}/${folderName}` : folderName;

            if (!folderMap.has(running)) {
              const folderId = generateId("dir");
              const createdFolder = await tx.projectFile.create({
                data: {
                  id: folderId,
                  projectId,
                  name: folderName,
                  path: running,
                  content: "",
                  language: "",
                  isFolder: true,
                  parentId: prev ? folderMap.get(prev) || null : null,
                  version: 1,
                },
              });
              folderMap.set(running, createdFolder.id);
              createdFiles.push(createdFolder);
            }
          }
        }

        const fileName = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join("/");
        const parentId = parentPath ? folderMap.get(parentPath) || null : null;
        const ext = fileName.split(".").pop()?.toLowerCase() || "";

        const existingFile = existingProject.files.find((f) => f.path === sanitized);
        if (existingFile) {
          const updated = await tx.projectFile.update({
            where: { id: existingFile.id },
            data: {
              content: incoming.content,
              version: { increment: 1 },
            },
          });
          createdFiles.push(updated);
        } else {
          const fileId = generateId("f");
          const created = await tx.projectFile.create({
            data: {
              id: fileId,
              projectId,
              name: fileName,
              path: sanitized,
              content: incoming.content,
              language: ext || "plaintext",
              isFolder: false,
              parentId,
              version: 1,
            },
          });
          createdFiles.push(created);
        }
      }
    });

    return res.status(201).json({
      success: true,
      files: createdFiles,
      message: `Uploaded ${createdFiles.length} file(s).`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Failed to upload files." });
  }
});

export default router;
