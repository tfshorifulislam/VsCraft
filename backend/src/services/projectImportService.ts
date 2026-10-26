import crypto from "crypto";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import prisma from "../db/prisma";
import {
  createCloudProject,
  updateProjectMetadata,
} from "./projectService";
import {
  resolveSafePath,
  writeProjectFileToDisk,
  deleteWorkspaceDir,
} from "./workspaceDisk";
import { detectProjectFramework } from "../utils/detectFramework";

const MAX_IMPORT_FILES = 20_000;
const MAX_IMPORT_TOTAL_CHARS = 512 * 1024 * 1024;
const MAX_BATCH_FILES = 500;
const MAX_FILE_CONTENT_CHARS = 40 * 1024 * 1024;
const MAX_CHUNK_CONTENT_CHARS = 1 * 1024 * 1024;
const MAX_FILE_CHUNKS = 48;
const MAX_PATH_LENGTH = 1_000;
const IMPORT_UPLOAD_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const IMPORT_UPLOADS_ROOT = path.join(os.tmpdir(), "code-editor-imports");

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const INVALID_WINDOWS_CHARS = /[:*?"<>|]/;

const PREFERRED_ACTIVE_PATHS = [
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

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "ico",
  "bmp",
  "avif",
  "svg",
]);

export interface ImportBatchFile {
  name?: string;
  path: string;
  content?: string;
  isFolder?: boolean;
}

export interface ImportBatchResult {
  files: number;
  folders: number;
}

export interface ImportChunkInput {
  uploadId: string;
  path: string;
  name?: string;
  chunk: string;
  index: number;
  totalChunks: number;
  totalChars: number;
  isBinary?: boolean;
  mimeType?: string;
}

export interface ImportChunkResult {
  complete: boolean;
  receivedChunks: number;
  totalChunks: number;
  files: number;
  folders: number;
}

export type ImportFailureStage = "validation" | "database" | "storage" | "upload";

export class ProjectImportError extends Error {
  constructor(
    message: string,
    public readonly stage: ImportFailureStage,
    public readonly status: number = 500
  ) {
    super(message);
    this.name = "ProjectImportError";
  }
}

/**
 * Normalizes and validates a path supplied by the browser before it is written
 * to PostgreSQL or the workspace filesystem.
 */
export function normalizeImportPath(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Import path must be a string.");
  }

  let normalized = raw.replace(/\0/g, "").replace(/\\/g, "/");
  normalized = normalized.replace(/^\.\/+/, "").replace(/^\/+/, "");

  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("Import contains an empty or invalid file path.");
  }

  if (normalized.length > MAX_PATH_LENGTH) {
    throw new Error(`Import path is too long (maximum ${MAX_PATH_LENGTH} characters).`);
  }

  const segments = normalized.split("/");
  for (const segment of segments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      INVALID_WINDOWS_CHARS.test(segment) ||
      segment.endsWith(" ") ||
      segment.endsWith(".") ||
      WINDOWS_RESERVED_NAME.test(segment)
    ) {
      throw new Error(`Import contains an invalid path segment: "${raw}".`);
    }
  }

  return segments.join("/");
}

function getParentPath(filePath: string): string | null {
  const index = filePath.lastIndexOf("/");
  return index === -1 ? null : filePath.slice(0, index);
}

function getFileLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return extension || "plaintext";
}

/**
 * Starts a persistent project import. The project is deliberately placed in
 * Trash until finalization, so an interrupted import never appears as a
 * successfully imported project in the dashboard.
 */
export async function beginProjectImport(
  ownerId: string,
  name: string,
  description?: string
) {
  const cleanName = (name || "").trim().slice(0, 200) || "Imported Project";
  const project = await createCloudProject(ownerId, {
    type: "blank",
    blankSubtype: "empty",
    name: cleanName,
    description: description?.trim() || "Imported from a local folder.",
  });

  await updateProjectMetadata(project.id, ownerId, { isTrash: true });
  return { ...project, isTrash: true };
}

async function getImportProjectOrThrow(projectId: string, ownerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true, isTrash: true },
  });
  if (!project) {
    throw new Error("Project not found or unauthorized.");
  }
  if (!project.isTrash) {
    throw new Error("This project is not in an active import session.");
  }
  return project;
}

/**
 * Adds one batch of files/folders to an in-progress import. Paths are
 * validated again server-side; the client is never trusted.
 */
export async function importProjectFileBatch(
  projectId: string,
  ownerId: string,
  incomingFiles: ImportBatchFile[]
): Promise<ImportBatchResult> {
  if (!Array.isArray(incomingFiles) || incomingFiles.length === 0) {
    throw new Error("No files received in this import batch.");
  }
  if (incomingFiles.length > MAX_BATCH_FILES) {
    throw new Error(`Import batch is too large (maximum ${MAX_BATCH_FILES} entries).`);
  }

  await getImportProjectOrThrow(projectId, ownerId);

  const normalizedItems = incomingFiles.map((file) => {
    const normalizedPath = normalizeImportPath(file.path);
    const isFolder = Boolean(file.isFolder);
    const content = isFolder ? "" : String(file.content ?? "");

    if (!isFolder && content.length > MAX_FILE_CONTENT_CHARS) {
      throw new Error(
        `File "${normalizedPath}" is too large for a single import request.`
      );
    }

    return {
      path: normalizedPath,
      isFolder,
      content,
    };
  });

  // Detect duplicate paths and case-only collisions before touching the DB.
  const seenPaths = new Map<string, string>();
  for (const item of normalizedItems) {
    const key = item.path.toLowerCase();
    const existing = seenPaths.get(key);
    if (existing === item.path) {
      throw new Error(`Import contains duplicate path "${item.path}".`);
    }
    if (existing && existing !== item.path) {
      throw new Error(
        `Import contains paths that differ only by case: "${existing}" and "${item.path}".`
      );
    }
    seenPaths.set(key, item.path);
  }

  // A file cannot also be a parent folder for another imported entry.
  const itemByLowerPath = new Map(normalizedItems.map((item) => [item.path.toLowerCase(), item]));
  for (const item of normalizedItems) {
    let parentPath = getParentPath(item.path);
    while (parentPath) {
      const parent = itemByLowerPath.get(parentPath.toLowerCase());
      if (parent && !parent.isFolder) {
        throw new Error(
          `Cannot import "${item.path}": "${parent.path}" is also a file in this import.`
        );
      }
      if (parent && parent.path !== parentPath) {
        throw new Error(
          `Import contains inconsistent casing between "${parent.path}" and "${item.path}".`
        );
      }
      parentPath = getParentPath(parentPath);
    }
  }

  const existingFiles = await prisma.projectFile.findMany({
    where: { projectId },
    select: { id: true, path: true, isFolder: true, version: true },
  });
  const existingByPath = new Map(existingFiles.map((file) => [file.path, file]));
  const existingByLowerPath = new Map(
    existingFiles.map((file) => [file.path.toLowerCase(), file])
  );

  for (const item of normalizedItems) {
    const collision = existingByLowerPath.get(item.path.toLowerCase());
    if (collision && collision.path !== item.path) {
      throw new Error(
        `Import path "${item.path}" collides with existing path "${collision.path}" on a case-insensitive filesystem.`
      );
    }

    let parentPath = getParentPath(item.path);
    while (parentPath) {
      const parent = existingByLowerPath.get(parentPath.toLowerCase());
      if (parent && !parent.isFolder) {
        throw new Error(
          `Cannot import "${item.path}": existing file "${parent.path}" is in the way.`
        );
      }
      if (parent && parent.path !== parentPath) {
        throw new Error(
          `Import path "${item.path}" collides with existing path "${parent.path}" on a case-insensitive filesystem.`
        );
      }
      parentPath = getParentPath(parentPath);
    }
  }

  // Reject paths that would escape the workspace even before any DB write.
  for (const item of normalizedItems) {
    resolveSafePath(projectId, item.path);
  }

  // Build all rows before opening a transaction. A large import used to issue
  // one INSERT per file inside an interactive transaction; on slower/remote
  // databases that exceeded Prisma's 60 second transaction limit. Bulk
  // createMany calls keep the transaction short and make batch size predictable.
  const requiredFolderPaths = new Set<string>();
  const addFolderAndAncestors = (folderPath: string | null) => {
    let current = folderPath;
    while (current) {
      requiredFolderPaths.add(current);
      current = getParentPath(current);
    }
  };

  for (const item of normalizedItems) {
    if (item.isFolder) addFolderAndAncestors(item.path);
    addFolderAndAncestors(getParentPath(item.path));
  }

  for (const folderPath of requiredFolderPaths) {
    const existingAtPath = existingByPath.get(folderPath);
    if (existingAtPath && !existingAtPath.isFolder) {
      throw new Error(`Cannot create folder "${folderPath}": a file already exists at this path.`);
    }
  }

  const folderMap = new Map<string, string>();
  for (const file of existingFiles) {
    if (file.isFolder) folderMap.set(file.path.toLowerCase(), file.id);
  }

  const newFolderRecords: Array<{
    id: string;
    projectId: string;
    name: string;
    path: string;
    content: string;
    language: string;
    isFolder: boolean;
    parentId: string | null;
    version: number;
  }> = [];

  for (const folderPath of [...requiredFolderPaths].sort(
    (a, b) => a.split("/").length - b.split("/").length
  )) {
    const key = folderPath.toLowerCase();
    if (folderMap.has(key)) continue;

    const parentPath = getParentPath(folderPath);
    const parentId = parentPath ? folderMap.get(parentPath.toLowerCase()) ?? null : null;
    const id = `dir_${crypto.randomBytes(8).toString("hex")}`;

    newFolderRecords.push({
      id,
      projectId,
      name: folderPath.split("/").pop() || folderPath,
      path: folderPath,
      content: "",
      language: "",
      isFolder: true,
      parentId,
      version: 1,
    });
    folderMap.set(key, id);
  }

  const newFileRecords: Array<{
    id: string;
    projectId: string;
    name: string;
    path: string;
    content: string;
    language: string;
    isFolder: boolean;
    parentId: string | null;
    version: number;
  }> = [];
  const replacedFileIds: string[] = [];
  const filesToWrite: Array<{ path: string; content: string; isFolder: boolean }> = [];

  for (const item of normalizedItems) {
    if (item.isFolder) continue;

    const parentPath = getParentPath(item.path);
    const parentId = parentPath ? folderMap.get(parentPath.toLowerCase()) ?? null : null;
    const existing = existingByPath.get(item.path);

    if (existing?.isFolder) {
      throw new Error(`Cannot create file "${item.path}": a folder already exists at this path.`);
    }

    const name = item.path.split("/").pop() || item.path;
    const language = getFileLanguage(item.path);

    if (existing) {
      replacedFileIds.push(existing.id);
    }

    newFileRecords.push({
      id: `f_${crypto.randomBytes(8).toString("hex")}`,
      projectId,
      name,
      path: item.path,
      content: item.content,
      language,
      isFolder: false,
      parentId,
      version: 1,
    });

    filesToWrite.push({
      path: item.path,
      content: item.content,
      isFolder: false,
    });
  }

  for (const folderPath of requiredFolderPaths) {
    filesToWrite.push({ path: folderPath, content: "", isFolder: true });
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        if (newFolderRecords.length > 0) {
          await tx.projectFile.createMany({ data: newFolderRecords });
        }
        if (replacedFileIds.length > 0) {
          await tx.projectFile.deleteMany({
            where: { id: { in: replacedFileIds } },
          });
        }
        if (newFileRecords.length > 0) {
          await tx.projectFile.createMany({ data: newFileRecords });
        }
        await tx.project.update({
          where: { id: projectId },
          data: { updatedAt: new Date() },
        });
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } catch (error: unknown) {
    console.error(
      `Import database write failed for project ${projectId}:`,
      error instanceof Error ? error.message : error
    );
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Transaction already closed") || message.includes("timed out")) {
      throw new ProjectImportError(
        "The database write timed out while saving this import batch. Try importing again.",
        "database",
        503
      );
    }
    throw new ProjectImportError(
      "The database could not save this import batch.",
      "database",
      500
    );
  }

  const result = {
    files: normalizedItems.filter((item) => !item.isFolder).length,
    folders: normalizedItems.filter((item) => item.isFolder).length,
    filesToWrite,
  };

  const totalFiles = await prisma.projectFile.count({
    where: { projectId, isFolder: false },
  });
  if (totalFiles > MAX_IMPORT_FILES) {
    throw new Error(
      `Project contains too many files (${totalFiles}). Maximum allowed is ${MAX_IMPORT_FILES}.`
    );
  }

  const [sizeRow] = await prisma.$queryRaw<Array<{ totalChars: any }>>`
    SELECT CAST(COALESCE(SUM(LENGTH(content)), 0) AS INTEGER) AS "totalChars"
    FROM "ProjectFile"
    WHERE "projectId" = ${projectId}
  `;
  if (Number(sizeRow?.totalChars ?? 0n) > MAX_IMPORT_TOTAL_CHARS) {
    throw new Error(
      `Project content exceeds the ${MAX_IMPORT_TOTAL_CHARS / (1024 * 1024)} MB import limit.`
    );
  }

  // Write to the workspace after the DB transaction commits. If this fails, the
  // caller aborts the import and the incomplete project is removed.
  for (const file of result.filesToWrite) {
    try {
      await writeProjectFileToDisk(projectId, file.path, file.content, file.isFolder);
    } catch (error: unknown) {
      console.error(
        `Import disk write failed for project ${projectId} at "${file.path}":`,
        error instanceof Error ? error.message : error
      );
      throw new ProjectImportError(
        `The project workspace could not store "${file.path}".`,
        "storage",
        500
      );
    }
  }

  return { files: result.files, folders: result.folders };
}

function getImportUploadRoot(projectId: string): string {
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeProjectId) {
    throw new ProjectImportError("Invalid project ID.", "validation", 400);
  }
  return path.join(IMPORT_UPLOADS_ROOT, safeProjectId);
}

function getImportUploadDir(projectId: string, uploadId: string): string {
  if (!IMPORT_UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new ProjectImportError("Invalid upload identifier.", "validation", 400);
  }
  return path.join(getImportUploadRoot(projectId), uploadId);
}

async function assertNoPendingImportUploads(projectId: string) {
  const uploadRoot = getImportUploadRoot(projectId);
  let entries;
  try {
    entries = await fsp.readdir(uploadRoot, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const pending: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const completePath = path.join(uploadRoot, entry.name, "complete.json");
    try {
      await fsp.access(completePath);
    } catch {
      const metaPath = path.join(uploadRoot, entry.name, "meta.json");
      let filePath = entry.name;
      try {
        const meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
        if (typeof meta?.path === "string") filePath = meta.path;
      } catch {
        // The upload directory is still identified by its ID in the error.
      }
      pending.push(filePath);
    }
  }

  if (pending.length > 0) {
    const sample = pending.slice(0, 3).join('", "');
    throw new ProjectImportError(
      `Large file upload is incomplete (${pending.length} pending): "${sample}". Retry the import.`,
      "upload",
      409
    );
  }
}

export async function clearProjectImportUploads(projectId: string) {
  const uploadRoot = getImportUploadRoot(projectId);
  await fsp.rm(uploadRoot, { recursive: true, force: true }).catch((error) => {
    console.error(
      `Failed to clean up import upload staging for project ${projectId}:`,
      error instanceof Error ? error.message : error
    );
  });
}

/**
 * Stores one chunk of a large file. Chunks are staged outside the project
 * workspace and persisted through the same batch importer only after every
 * chunk has arrived. Re-sending a chunk overwrites the previous copy, which
 * makes failed chunk requests safe to retry.
 */
export async function appendProjectImportChunk(
  projectId: string,
  ownerId: string,
  input: ImportChunkInput
): Promise<ImportChunkResult> {
  const {
    uploadId,
    path: rawPath,
    name,
    chunk,
    index,
    totalChunks,
    totalChars,
    isBinary,
    mimeType,
  } = input;

  if (typeof uploadId !== "string" || !IMPORT_UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new ProjectImportError("Invalid upload identifier.", "validation", 400);
  }
  if (typeof chunk !== "string") {
    throw new ProjectImportError("Upload chunk must be a string.", "validation", 400);
  }
  if (chunk.length > MAX_CHUNK_CONTENT_CHARS) {
    throw new ProjectImportError(
      `Upload chunk is too large (maximum ${MAX_CHUNK_CONTENT_CHARS} characters).`,
      "validation",
      413
    );
  }
  if (!Number.isInteger(index) || !Number.isInteger(totalChunks)) {
    throw new ProjectImportError("Invalid upload chunk index.", "validation", 400);
  }
  if (totalChunks < 1 || totalChunks > MAX_FILE_CHUNKS || index < 0 || index >= totalChunks) {
    throw new ProjectImportError("Invalid upload chunk range.", "validation", 400);
  }
  if (!Number.isInteger(totalChars) || totalChars < 0 || totalChars > MAX_FILE_CONTENT_CHARS) {
    throw new ProjectImportError(
      `File is too large for import (maximum ${MAX_FILE_CONTENT_CHARS / (1024 * 1024)} MB).`,
      "validation",
      413
    );
  }
  if (chunk.length > totalChars) {
    throw new ProjectImportError("Upload chunk exceeds the declared file size.", "validation", 400);
  }

  const normalizedPath = normalizeImportPath(rawPath);
  resolveSafePath(projectId, normalizedPath);
  await getImportProjectOrThrow(projectId, ownerId);

  const fileName = (name || normalizedPath.split("/").pop() || "file").slice(0, 255);
  const uploadDir = getImportUploadDir(projectId, uploadId);
  const metaPath = path.join(uploadDir, "meta.json");
  const meta = {
    path: normalizedPath,
    name: fileName,
    totalChunks,
    totalChars,
    isBinary: Boolean(isBinary),
    mimeType: typeof mimeType === "string" ? mimeType.slice(0, 200) : "",
  };

  try {
    await fsp.mkdir(uploadDir, { recursive: true });
    let existingMeta: typeof meta | null = null;
    try {
      existingMeta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (
      existingMeta &&
      (existingMeta.path !== meta.path ||
        existingMeta.totalChunks !== meta.totalChunks ||
        existingMeta.totalChars !== meta.totalChars)
    ) {
      throw new ProjectImportError(
        `Upload session for "${normalizedPath}" does not match its original metadata.`,
        "upload",
        409
      );
    }
    if (!existingMeta) {
      await fsp.writeFile(metaPath, JSON.stringify(meta), "utf8");
    }

    await fsp.writeFile(path.join(uploadDir, `${index}.part`), chunk, "utf8");
  } catch (error: unknown) {
    if (error instanceof ProjectImportError) throw error;
    console.error(
      `Failed to store import chunk for project ${projectId} at "${normalizedPath}":`,
      error instanceof Error ? error.message : error
    );
    throw new ProjectImportError(
      `The server could not store the upload for "${normalizedPath}".`,
      "storage",
      500
    );
  }

  if (index < totalChunks - 1) {
    return {
      complete: false,
      receivedChunks: index + 1,
      totalChunks,
      files: 0,
      folders: 0,
    };
  }

  const chunks: string[] = [];
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    try {
      chunks.push(await fsp.readFile(path.join(uploadDir, `${chunkIndex}.part`), "utf8"));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProjectImportError(
          `Upload for "${normalizedPath}" is missing chunk ${chunkIndex + 1}/${totalChunks}.`,
          "upload",
          400
        );
      }
      throw error;
    }
  }

  const content = chunks.join("");
  if (content.length !== totalChars) {
    throw new ProjectImportError(
      `Upload for "${normalizedPath}" is incomplete: expected ${totalChars} characters but received ${content.length}.`,
      "upload",
      400
    );
  }

  const result = await importProjectFileBatch(projectId, ownerId, [
    {
      name: fileName,
      path: normalizedPath,
      content,
      isFolder: false,
    },
  ]);

  try {
    await fsp.writeFile(
      path.join(uploadDir, "complete.json"),
      JSON.stringify({ path: normalizedPath, totalChars, completedAt: new Date().toISOString() }),
      "utf8"
    );
  } catch (error: unknown) {
    console.error(
      `Failed to mark import upload complete for project ${projectId} at "${normalizedPath}":`,
      error instanceof Error ? error.message : error
    );
    throw new ProjectImportError(
      `The upload for "${normalizedPath}" was saved but its completion marker could not be stored. Retry the file.`,
      "storage",
      500
    );
  }

  return {
    complete: true,
    receivedChunks: totalChunks,
    totalChunks,
    ...result,
  };
}

export async function finalizeProjectImport(projectId: string, ownerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true, name: true, description: true, isTrash: true },
  });
  if (!project) {
    throw new Error("Project not found or unauthorized.");
  }
  if (!project.isTrash) {
    throw new Error("This project is not in an active import session.");
  }

  await assertNoPendingImportUploads(projectId);

  const fileMetadata = await prisma.projectFile.findMany({
    where: { projectId, isFolder: false },
    select: { id: true, name: true, path: true, isFolder: true },
    orderBy: { path: "asc" },
  });

  if (fileMetadata.length === 0) {
    throw new Error("The selected folder does not contain any files to import.");
  }

  const detectionFiles = await prisma.projectFile.findMany({
    where: {
      projectId,
      path: { in: ["package.json", "requirements.txt", "pyproject.toml", "Pipfile", "Cargo.toml", "go.mod"] },
    },
    select: { path: true, name: true, content: true },
  });
  const contentByPath = new Map(detectionFiles.map((file) => [file.path, file.content]));
  const detection = detectProjectFramework(
    fileMetadata.map((file) => ({
      path: file.path,
      name: file.name,
      content: contentByPath.get(file.path),
    }))
  );

  const activeFile =
    PREFERRED_ACTIVE_PATHS.map((path) =>
      fileMetadata.find((file) => file.path.toLowerCase() === path.toLowerCase())
    ).find(Boolean) || fileMetadata[0];

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      template: detection.template,
      isTrash: false,
      trashedAt: null,
      activeFileId: activeFile.id,
      openFileIds: JSON.stringify([activeFile.id]),
      description:
        project.description && project.description !== "Imported from a local folder."
          ? project.description
          : `Imported ${detection.frameworkName} project (${detection.language}).`,
    },
  });

  await clearProjectImportUploads(projectId);

  return {
    project: {
      id: updated.id,
      name: updated.name,
      template: updated.template,
      activeFileId: updated.activeFileId,
      openFileIds: [activeFile.id],
      fileCount: fileMetadata.length,
    },
    detection,
  };
}

export async function abortProjectImport(projectId: string, ownerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true, isTrash: true },
  });

  // Only unfinished imports (kept in Trash) may be aborted through this path.
  if (!project || !project.isTrash) {
    return false;
  }

  await prisma.project.delete({ where: { id: projectId } });
  await deleteWorkspaceDir(projectId).catch((err) =>
    console.error(`Failed to clean up aborted import workspace ${projectId}:`, err)
  );
  await clearProjectImportUploads(projectId);
  return true;
}
