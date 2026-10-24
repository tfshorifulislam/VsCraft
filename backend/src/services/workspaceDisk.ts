import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import prisma from "../db/prisma";
import { ProjectFile } from "../types/editor";
import crypto from "crypto";

const WORKSPACES_ROOT = process.env.WORKSPACES_DIR
  ? path.resolve(process.env.WORKSPACES_DIR)
  : path.resolve(__dirname, "../../workspaces");

function generateId(prefix: string = "f"): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Returns the absolute workspace directory for a project.
 */
export function getWorkspaceDir(projectId: string): string {
  // Disallow path traversal in projectId
  const sanitizedId = projectId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!sanitizedId) throw new Error("Invalid project ID.");
  return path.join(WORKSPACES_ROOT, sanitizedId);
}

/**
 * Validates that a file path resolves strictly inside the project's workspace directory.
 * Defends against directory traversal (../), absolute escapes, null bytes, and symlinks.
 */
export function resolveSafePath(projectId: string, relativePath: string): string {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Invalid relative path.");
  }

  // Reject null bytes
  if (relativePath.includes("\0")) {
    throw new Error(`Security Violation: Null byte detected in path: ${relativePath}`);
  }

  const workspaceDir = path.resolve(getWorkspaceDir(projectId));
  const cleanRelative = relativePath.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const target = path.resolve(workspaceDir, cleanRelative);

  // Lexical path traversal check
  if (target !== workspaceDir && !target.startsWith(workspaceDir + path.sep)) {
    throw new Error(`Security Violation: Path traversal outside workspace: ${relativePath}`);
  }

  // Physical symlink check
  try {
    const realWorkspace = fs.existsSync(workspaceDir) ? fs.realpathSync(workspaceDir) : workspaceDir;

    if (fs.existsSync(target)) {
      const realTarget = fs.realpathSync(target);
      if (realTarget !== realWorkspace && !realTarget.startsWith(realWorkspace + path.sep)) {
        throw new Error(`Security Violation: Symlink points outside workspace: ${relativePath}`);
      }
    } else {
      // For paths that do not exist yet, verify that existing parent directories are not symlinks escaping workspace
      let current = path.dirname(target);
      while (current.length >= workspaceDir.length) {
        if (fs.existsSync(current)) {
          const realAncestor = fs.realpathSync(current);
          if (realAncestor !== realWorkspace && !realAncestor.startsWith(realWorkspace + path.sep)) {
            throw new Error(`Security Violation: Ancestor directory symlink escapes workspace: ${relativePath}`);
          }
          break;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("Security Violation")) {
      throw err;
    }
    // ENOENT or normal fs race conditions are acceptable for new files
  }

  return target;
}

/**
 * Ensures that the physical workspace directory on disk exists and contains
 * all files from the database. Writes missing or updated files to disk.
 */
export async function ensureWorkspaceOnDisk(project: {
  id: string;
  files: Array<{ id?: string; path: string; isFolder: boolean; content: string }>;
  contentLazy?: boolean;
  loadedFileIds?: string[];
}): Promise<string> {
  const workspaceDir = getWorkspaceDir(project.id);
  await fsp.mkdir(workspaceDir, { recursive: true });
  const loadedIds = project.contentLazy
    ? new Set(project.loadedFileIds || [])
    : null;

  for (const file of project.files) {
    if (file.isFolder) {
      const folderPath = resolveSafePath(project.id, file.path);
      await fsp.mkdir(folderPath, { recursive: true });
    } else {
      if (loadedIds && (!file.id || !loadedIds.has(file.id))) {
        continue;
      }
      const filePath = resolveSafePath(project.id, file.path);
      const parentDir = path.dirname(filePath);
      await fsp.mkdir(parentDir, { recursive: true });

      // Handle binary images vs text content
      const rawContent = file.content || "";
      if (rawContent.startsWith("data:") && rawContent.includes(";base64,")) {
        const commaIndex = rawContent.indexOf(",");
        const base64Data = rawContent.slice(commaIndex + 1);
        const buffer = Buffer.from(base64Data, "base64");
        await fsp.writeFile(filePath, buffer);
      } else {
        await fsp.writeFile(filePath, rawContent, "utf-8");
      }
    }
  }

  return workspaceDir;
}

/**
 * Writes or updates a single file or directory on disk.
 */
export async function writeProjectFileToDisk(
  projectId: string,
  relativePath: string,
  content: string,
  isFolder: boolean
): Promise<void> {
  const targetPath = resolveSafePath(projectId, relativePath);

  if (isFolder) {
    await fsp.mkdir(targetPath, { recursive: true });
    return;
  }

  const parentDir = path.dirname(targetPath);
  await fsp.mkdir(parentDir, { recursive: true });

  const safeContent = content || "";
  if (safeContent.startsWith("data:") && safeContent.includes(";base64,")) {
    const commaIndex = safeContent.indexOf(",");
    const base64Data = safeContent.slice(commaIndex + 1);
    const buffer = Buffer.from(base64Data, "base64");
    await fsp.writeFile(targetPath, buffer);
  } else {
    await fsp.writeFile(targetPath, safeContent, "utf-8");
  }
}

/**
 * Deletes a file or directory from the workspace on disk.
 */
export async function deleteWorkspaceDir(projectId: string): Promise<void> {
  const workspaceDir = getWorkspaceDir(projectId);
  await fsp.rm(workspaceDir, { recursive: true, force: true });
}

export async function deleteProjectFileFromDisk(
  projectId: string,
  relativePath: string
): Promise<void> {
  const targetPath = resolveSafePath(projectId, relativePath);
  try {
    const stat = await fsp.stat(targetPath);
    if (stat.isDirectory()) {
      await fsp.rm(targetPath, { recursive: true, force: true });
    } else {
      await fsp.unlink(targetPath);
    }
  } catch (err: unknown) {
    // If already deleted, ignore error
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "ENOENT") {
      return;
    }
    throw err;
  }
}

/**
 * Renames a file or directory on disk.
 */
export async function renameProjectFileOnDisk(
  projectId: string,
  oldRelativePath: string,
  newRelativePath: string
): Promise<void> {
  const oldTarget = resolveSafePath(projectId, oldRelativePath);
  const newTarget = resolveSafePath(projectId, newRelativePath);

  const newParent = path.dirname(newTarget);
  await fsp.mkdir(newParent, { recursive: true });

  await fsp.rename(oldTarget, newTarget);
}

const IGNORED_DISK_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".turbo",
  "__pycache__",
  ".vscode",
  ".DS_Store",
  "Thumbs.db",
]);

/**
 * Scans the workspace directory on disk and synchronizes any newly created or modified
 * files into the SQLite database. This ensures commands executed in the terminal
 * (e.g. `mkdir utils`, `touch file.txt`, `echo '...' > app.js`) appear immediately in
 * the File Explorer and Editor!
 */
export async function syncDiskToDatabase(projectId: string): Promise<ProjectFile[]> {
  const workspaceDir = getWorkspaceDir(projectId);
  if (!fs.existsSync(workspaceDir)) {
    return [];
  }

  // Ensure project exists in database before reconciling
  const projectExists = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!projectExists) {
    return [];
  }

  // 1. Fetch current DB files
  const dbFiles = await prisma.projectFile.findMany({
    where: { projectId },
  });
  const dbFileMap = new Map<string, typeof dbFiles[0]>();
  for (const f of dbFiles) {
    dbFileMap.set(f.path, f);
  }

  // 2. Walk directory recursively
  const diskFiles: {
    path: string;
    name: string;
    content: string;
    isFolder: boolean;
    language: string;
  }[] = [];

  async function walk(currentDir: string, relativeDir: string = "") {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_DISK_NAMES.has(entry.name)) continue;

      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const fullPath = path.join(currentDir, entry.name);

      // Defend against symlink escapes in directory traversal
      if (entry.isSymbolicLink()) {
        try {
          const realEntry = fs.realpathSync(fullPath);
          const realWorkspace = fs.realpathSync(workspaceDir);
          if (realEntry !== realWorkspace && !realEntry.startsWith(realWorkspace + path.sep)) {
            console.warn(`[Security] Ignored external symlink in workspace: ${relPath}`);
            continue;
          }
        } catch {
          continue;
        }
      }

      if (entry.isDirectory()) {
        diskFiles.push({
          path: relPath,
          name: entry.name,
          content: "",
          isFolder: true,
          language: "",
        });
        await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = entry.name.split(".").pop()?.toLowerCase() || "";
        const isImage = ["png", "jpg", "jpeg", "webp", "gif", "ico", "bmp", "avif"].includes(ext);

        let content = "";
        try {
          if (isImage) {
            const buf = await fsp.readFile(fullPath);
            content = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`;
          } else {
            content = await fsp.readFile(fullPath, "utf-8");
          }
        } catch {
          content = "";
        }

        diskFiles.push({
          path: relPath,
          name: entry.name,
          content,
          isFolder: false,
          language: isImage ? "image" : ext || "plaintext",
        });
      }
    }
  }

  await walk(workspaceDir);

  // 3. Reconcile with DB: add new files, update changed files
  const folderIdMap = new Map<string, string>();
  for (const f of dbFiles) {
    if (f.isFolder) folderIdMap.set(f.path, f.id);
  }

  // Create missing folders first
  for (const item of diskFiles) {
    if (item.isFolder && !dbFileMap.has(item.path)) {
      const parentRel = path.dirname(item.path);
      const parentId = parentRel !== "." ? folderIdMap.get(parentRel.replace(/\\/g, "/")) || null : null;

      const created = await prisma.projectFile.create({
        data: {
          id: generateId("f_dir"),
          projectId,
          name: item.name,
          path: item.path,
          content: "",
          language: "",
          isFolder: true,
          parentId,
          version: 1,
        },
      });
      folderIdMap.set(item.path, created.id);
      dbFileMap.set(item.path, created);
    }
  }

  // Create missing files and update changed files
  for (const item of diskFiles) {
    if (item.isFolder) continue;

    const existing = dbFileMap.get(item.path);
    const parentRel = path.dirname(item.path);
    const parentId = parentRel !== "." ? folderIdMap.get(parentRel.replace(/\\/g, "/")) || null : null;

    if (!existing) {
      const created = await prisma.projectFile.create({
        data: {
          id: generateId("f"),
          projectId,
          name: item.name,
          path: item.path,
          content: item.content,
          language: item.language,
          isFolder: false,
          parentId,
          version: 1,
        },
      });
      dbFileMap.set(item.path, created);
    } else if (existing.content !== item.content) {
      const updated = await prisma.projectFile.update({
        where: { id: existing.id },
        data: {
          content: item.content,
          version: existing.version + 1,
          updatedAt: new Date(),
        },
      });
      dbFileMap.set(item.path, updated);
    }
  }

  // 3b. Delete files and folders from DB that were removed from disk
  const diskPathSet = new Set(diskFiles.map((d) => d.path));
  // Delete files first, then folders (reverse path length order)
  const toDelete = dbFiles
    .filter((f) => !diskPathSet.has(f.path))
    .sort((a, b) => b.path.length - a.path.length);

  for (const del of toDelete) {
    try {
      await prisma.projectFile.delete({ where: { id: del.id } });
      dbFileMap.delete(del.path);
    } catch {
      // Ignore if already cascadingly deleted
    }
  }

  // 4. Return complete updated file list
  const finalFiles = await prisma.projectFile.findMany({
    where: { projectId },
    orderBy: { path: "asc" },
  });

  return finalFiles.map((f) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    content: f.content,
    language: f.language,
    isFolder: f.isFolder,
    parentId: f.parentId,
    version: f.version,
  }));
}
