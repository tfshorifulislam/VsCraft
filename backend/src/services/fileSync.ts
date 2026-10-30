import fs from "fs/promises";
import path from "path";
import prisma from "../db/prisma";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
]);

const IGNORED_FILES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  ".npmrc",
]);

const MAX_SYNC_FILE_BYTES = parseInt(
  process.env.MAX_SYNC_FILE_BYTES || "1048576",
  10
);

export type FileBaseline = Map<string, string>;

function toPosix(relPath: string): string {
  return relPath.split(path.sep).join("/");
}

function safetyCheck(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error("Unsafe path detected while syncing workspace.");
  }
  return resolvedTarget;
}

export function isIgnored(relPath: string): boolean {
  const parts = relPath.split("/").filter(Boolean);
  if (parts.some((part) => IGNORED_DIRS.has(part.toLowerCase()))) {
    return true;
  }
  const name = (parts[parts.length - 1] || "").toLowerCase();
  return IGNORED_FILES.has(name);
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000);
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] === 0) return true;
  }
  return false;
}

/**
 * Writes the project's database files into an ephemeral session directory.
 * Nothing written here outlives the terminal session.
 */
export async function materializeProjectFiles(
  projectId: string,
  dir: string
): Promise<FileBaseline> {
  const files = await prisma.projectFile.findMany({ where: { projectId } });
  const baseline: FileBaseline = new Map();

  for (const file of files) {
    if (isIgnored(file.path)) continue;
    baseline.set(file.path, file.content);
    const target = safetyCheck(dir, path.join(dir, file.path));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
  }

  return baseline;
}

async function walkDirectory(
  root: string,
  current: string,
  output: Array<{ relPath: string; content: string }>
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relPath = toPosix(path.relative(root, absolute));

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
      await walkDirectory(root, absolute, output);
      continue;
    }

    if (!entry.isFile()) continue;
    if (isIgnored(relPath)) continue;

    try {
      const stat = await fs.stat(absolute);
      if (stat.size > MAX_SYNC_FILE_BYTES) continue;
      const buffer = await fs.readFile(absolute);
      if (looksBinary(buffer)) continue;
      output.push({ relPath, content: buffer.toString("utf8") });
    } catch {
      // Ignore files that disappear or cannot be read.
    }
  }
}

export interface SyncResult {
  updated: number;
  deleted: number;
  baseline: FileBaseline;
}

/**
 * Reconciles the ephemeral session directory back into the `files` table.
 *
 * Only files that changed on disk are upserted. Files that were part of the
 * original baseline but have been removed on disk are deleted. Files created in
 * the database *after* the session started are left untouched to avoid wiping
 * editor-side work.
 */
export async function syncDirectoryToDatabase(
  projectId: string,
  dir: string,
  baseline: FileBaseline
): Promise<SyncResult> {
  const diskFiles: Array<{ relPath: string; content: string }> = [];
  await walkDirectory(dir, dir, diskFiles);

  const diskPaths = new Set(diskFiles.map((file) => file.relPath));
  let updated = 0;

  for (const file of diskFiles) {
    if (baseline.get(file.relPath) === file.content) continue;

    await prisma.projectFile.upsert({
      where: {
        projectId_path: { projectId, path: file.relPath },
      },
      create: {
        projectId,
        path: file.relPath,
        content: file.content,
      },
      update: {
        content: file.content,
      },
    });
    baseline.set(file.relPath, file.content);
    updated += 1;
  }

  let deleted = 0;
  for (const [relPath] of Array.from(baseline.entries())) {
    if (diskPaths.has(relPath) || isIgnored(relPath)) continue;
    await prisma.projectFile
      .deleteMany({ where: { projectId, path: relPath } })
      .catch(() => undefined);
    baseline.delete(relPath);
    deleted += 1;
  }

  if (updated > 0 || deleted > 0) {
    await prisma.project
      .update({ where: { id: projectId }, data: { updatedAt: new Date() } })
      .catch(() => undefined);
  }

  return { updated, deleted, baseline };
}
