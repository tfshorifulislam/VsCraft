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
import {
  beginProjectImport,
  importProjectFileBatch,
  appendProjectImportChunk,
  finalizeProjectImport,
  abortProjectImport,
  clearProjectImportUploads,
  ProjectImportError,
} from "../services/projectImportService";
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

const BINARY_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "ico", "bmp", "avif", "woff", "woff2", "ttf", "otf", "eot", "wasm", "pdf", "mp3", "mp4", "wav"]);
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
    .replace(/^\.\//, "")
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
    case "woff": return "font/woff"; case "woff2": return "font/woff2"; case "ttf": return "font/ttf"; case "wasm": return "application/wasm"; case "pdf": return "application/pdf"; case "avif":
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
    const projectDescription = (req.body?.description as string) || "";
    const extractedFiles: {
      name: string;
      path: string;
      content: string;
      isFolder: boolean;
      language?: string;
    }[] = [];

    if (req.body?.zipBase64) {
      let buffer: Buffer;
      try {
        buffer = Buffer.from(req.body.zipBase64, "base64");
      } catch {
        return res.status(400).json({ error: "Invalid base64 encoding in ZIP archive." });
      }

      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(buffer);
      } catch {
        return res.status(400).json({ error: "Unable to parse ZIP archive. Ensure it is a valid, uncorrupted .zip file." });
      }

      const entries = Object.keys(zip.files);
      if (entries.length === 0) {
        return res.status(400).json({ error: "The uploaded ZIP archive is empty." });
      }

      // Check for common root directory prefix in ZIP
      const nonDirRawPaths = entries.filter((p) => !zip.files[p].dir);
      let commonRoot = "";
      if (nonDirRawPaths.length > 0) {
        const firstSlash = nonDirRawPaths[0].indexOf("/");
        if (firstSlash !== -1) {
          const candidate = nonDirRawPaths[0].slice(0, firstSlash + 1);
          if (nonDirRawPaths.every((p) => p.startsWith(candidate))) {
            commonRoot = candidate;
          }
        }
      }

      if (!projectName && commonRoot) {
        projectName = commonRoot.replace(/\/$/, "").replace(/[-_]/g, " ");
      }

      for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        let relative = rawPath;
        if (commonRoot && relative.startsWith(commonRoot)) {
          relative = relative.slice(commonRoot.length);
        }
        if (!relative) continue;

        let sanitized: string;
        try {
          sanitized = sanitizePath(relative);
        } catch (sanitizeErr) {
          return res.status(400).json({ error: (sanitizeErr as Error).message });
        }
        if (!sanitized || isIgnored(sanitized)) continue;

        const fileName = sanitized.split("/").pop() || "";
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const isBinary = BINARY_EXTENSIONS.has(ext);

        let content = "";
        if (isBinary && ext !== "svg") {
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
          language: isBinary ? (IMAGE_EXTENSIONS.has(ext) ? "image" : ext) : ext || "plaintext",
        });
      }
    } else if (Array.isArray(req.body?.files)) {
      for (const f of req.body.files) {
        if (!f || typeof f !== "object") continue;
        let sanitized: string;
        try {
          sanitized = sanitizePath(f.path || f.name || "");
        } catch (sanitizeErr) {
          return res.status(400).json({ error: (sanitizeErr as Error).message });
        }
        if (!sanitized || isIgnored(sanitized)) continue;

        const fileName = sanitized.split("/").pop() || f.name;
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const isBinary = BINARY_EXTENSIONS.has(ext);

        extractedFiles.push({
          name: fileName,
          path: sanitized,
          content: f.content || "",
          isFolder: Boolean(f.isFolder),
          language: isBinary ? (IMAGE_EXTENSIONS.has(ext) ? "image" : ext) : ext || "plaintext",
        });
      }
    } else {
      return res.status(400).json({ error: "No files or archive provided in request." });
    }

    const fileEntries = extractedFiles.filter((f) => !f.isFolder);

    if (fileEntries.length === 0) {
      return res.status(400).json({
        error: "No valid files found to import (all files/dependencies may have been filtered or ignored).",
      });
    }

    if (fileEntries.length > 5000) {
      return res.status(400).json({
        error: `Project contains too many files (${fileEntries.length}). Maximum allowed is 5000 files.`,
      });
    }

    const detection = detectProjectFramework(fileEntries);
    const chosenTemplate = detection.template;

    const pkg = fileEntries.find((f) => f.path === "package.json");
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

    // Build directory tree
    const directoryPaths = new Set<string>();
    for (const f of fileEntries) {
      const parts = f.path.split("/");
      let current = "";
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        directoryPaths.add(current);
      }
    }

    const sortedDirPaths = Array.from(directoryPaths).sort(
      (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)
    );

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

    // 1. Folders
    for (const dirPath of sortedDirPaths) {
      const dirId = generateId("dir");
      folderMap.set(dirPath, dirId);
      const parts = dirPath.split("/");
      const dirName = parts[parts.length - 1];
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
      const parentId = parentPath ? folderMap.get(parentPath) || null : null;

      fileRecordsToCreate.push({
        id: dirId,
        name: dirName,
        path: dirPath,
        content: "",
        language: "",
        isFolder: true,
        parentId,
        version: 1,
      });
    }

    // 2. Files
    for (const f of fileEntries) {
      const parts = f.path.split("/");
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
      const parentId = parentPath ? folderMap.get(parentPath) || null : null;

      fileRecordsToCreate.push({
        id: generateId("f"),
        name: f.name,
        path: f.path,
        content: f.content,
        language: f.language || "plaintext",
        isFolder: false,
        parentId,
        version: 1,
      });
    }

    const preferredFiles = [
      "src/app/page.tsx",
      "src/app/page.jsx",
      "src/app/page.js",
      "app/page.tsx",
      "src/pages/index.tsx",
      "src/pages/index.jsx",
      "src/pages/index.js",
      "pages/index.tsx",
      "src/App.tsx",
      "src/App.jsx",
      "src/main.tsx",
      "src/main.jsx",
      "src/index.tsx",
      "src/index.jsx",
      "src/index.js",
      "index.html",
      "server.js",
      "server.ts",
      "src/server.ts",
      "main.py",
      "app.py",
      "main.go",
      "main.rs",
      "package.json",
      "README.md",
    ];

    let activeRecord: (typeof fileRecordsToCreate)[0] | undefined;
    for (const pref of preferredFiles) {
      const match = fileRecordsToCreate.find(
        (f) => !f.isFolder && f.path.toLowerCase() === pref.toLowerCase()
      );
      if (match) {
        activeRecord = match;
        break;
      }
    }
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
    }, { maxWait: 10000, timeout: 30000 });

    // Write all project files to disk workspace immediately!
    try {
      await ensureWorkspaceOnDisk({
        id: newProject.id,
        files: fileRecordsToCreate,
      });
    } catch (diskErr) {
      console.error("Failed to write imported project to workspace disk:", diskErr);
    }

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

// POST /api/projects/import/begin - start a chunked local-folder import
router.post("/import/begin", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { name, description } = req.body || {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "A project name is required." });
  }

  try {
    const project = await beginProjectImport(
      userId,
      name,
      typeof description === "string" ? description : undefined
    );
    return res.status(201).json({ project });
  } catch (error: unknown) {
    console.error("Begin project import error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to start project import.",
    });
  }
});

// POST /api/projects/:id/import/files - append a validated batch of files/folders
router.post("/:id/import/files", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const files = req.body?.files;
    if (!Array.isArray(files)) {
      return res.status(400).json({ error: "The import request must include a files array." });
    }

    const result = await importProjectFileBatch(projectId, userId, files);
    return res.status(201).json({ success: true, ...result });
  } catch (error: unknown) {
    console.error(
      "Import file batch error:",
      error instanceof Error ? error.message : error
    );
    if (error instanceof ProjectImportError) {
      return res.status(error.status).json({
        error: error.message,
        stage: error.stage,
      });
    }

    const message = error instanceof Error ? error.message : "Failed to import files.";
    const isNotFound = message.includes("not found or unauthorized");
    const isDatabaseError =
      typeof error === "object" &&
      error !== null &&
      (typeof (error as { code?: unknown }).code === "string" ||
        (error instanceof Error && error.name.startsWith("Prisma")));

    if (isDatabaseError) {
      return res.status(500).json({
        error: "The database could not save this import batch.",
        stage: "database",
      });
    }

    return res.status(isNotFound ? 404 : 400).json({
      error: message,
      stage: "validation",
    });
  }
});

// POST /api/projects/:id/import/chunk - stage one chunk of a large file
router.post("/:id/import/chunk", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const result = await appendProjectImportChunk(projectId, userId, req.body || {});
    return res.status(201).json({ success: true, ...result });
  } catch (error: unknown) {
    console.error(
      "Import chunk error:",
      error instanceof Error ? error.message : error
    );
    if (error instanceof ProjectImportError) {
      return res.status(error.status).json({
        error: error.message,
        stage: error.stage,
      });
    }

    const message = error instanceof Error ? error.message : "Failed to store import chunk.";
    const status = message.includes("not found or unauthorized") ? 404 : 400;
    return res.status(status).json({ error: message, stage: "upload" });
  }
});

// POST /api/projects/:id/import/finalize - mark the imported project as complete
router.post("/:id/import/finalize", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const result = await finalizeProjectImport(projectId, userId);
    return res.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error(
      "Finalize project import error:",
      error instanceof Error ? error.message : error
    );
    if (error instanceof ProjectImportError) {
      return res.status(error.status).json({
        error: error.message,
        stage: error.stage,
      });
    }
    const message = error instanceof Error ? error.message : "Failed to finalize project import.";
    const status = message.includes("not found or unauthorized") ? 404 : 400;
    return res.status(status).json({ error: message, stage: "validation" });
  }
});

// POST /api/projects/:id/import/abort - delete an incomplete import and its workspace
router.post("/:id/import/abort", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const aborted = await abortProjectImport(projectId, userId);
    if (!aborted) {
      return res.status(404).json({ error: "No incomplete import was found for this project." });
    }
    return res.json({ success: true });
  } catch (error: unknown) {
    console.error("Abort project import error:", error);
    return res.status(500).json({ error: "Failed to clean up the incomplete import." });
  }
});

// POST /api/projects/trash/empty
router.post("/trash/empty", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await emptyTrashForUser(userId);
    await Promise.all(result.ids.map((id) => clearProjectImportUploads(id)));
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
    const project = await getProjectById(projectId, userId, {
      includeContent: req.query.includeContent === "full" ? "full" : "auto",
    });
    if (!project) {
      return res.status(404).json({ error: "Project not found or unauthorized." });
    }

    if (!project.contentLazy) {
      try {
        await ensureWorkspaceOnDisk(project);
      } catch (diskErr) {
        console.warn("Could not synchronize workspace to disk:", diskErr);
      }
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
    if (permanent) {
      await clearProjectImportUploads(projectId);
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
  await clearProjectImportUploads(projectId);

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

  const project = await getProjectById(projectId, userId, { includeContent: "full" });
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
