import { cloudApi } from "@/lib/cloud/cloudApi";
import type { ProjectImportFile } from "@/types/editor";

export type FolderImportPhase =
  | "selecting"
  | "scanning"
  | "creating"
  | "uploading"
  | "finalizing"
  | "done";

export interface FolderImportProgress {
  phase: FolderImportPhase;
  message: string;
  folderName?: string;
  filesFound: number;
  foldersFound: number;
  totalFiles: number;
  totalBytes: number;
  processedFiles: number;
  uploadedBytes: number;
  currentPath?: string;
  excludedCount: number;
  excludedPaths: string[];
  warnings: string[];
}

export interface FolderSourceFile {
  path: string;
  name: string;
  size: number;
  type: string;
  getFile: () => Promise<File>;
}

export interface FolderSelection {
  name: string;
  files: FolderSourceFile[];
  folders: Array<{ path: string; name: string }>;
  totalBytes: number;
  excludedCount: number;
  excludedPaths: string[];
  warnings: string[];
}

export interface FolderImportResult {
  projectId: string;
  projectName: string;
  fileCount: number;
  folderCount: number;
  totalBytes: number;
  excludedCount: number;
  excludedPaths: string[];
  warnings: string[];
}

type ProgressCallback = (progress: FolderImportProgress) => void;

interface DirectoryHandleLike {
  name: string;
  kind: "directory";
  values: () => AsyncIterableIterator<DirectoryEntryLike>;
}

interface FileHandleLike {
  name: string;
  kind: "file";
  getFile: () => Promise<File>;
}

type DirectoryEntryLike = DirectoryHandleLike | FileHandleLike;

const MAX_FILES = 20_000;
const MAX_FOLDERS = 10_000;
const MAX_DEPTH = 64;
const MAX_TOTAL_BYTES = 350 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_BODY_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_FILES = 200;
const MAX_CHUNK_CONTENT_CHARS = 1024 * 1024;
const MAX_CHUNKS_PER_FILE = 48;

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".angular",
  ".expo",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".yarn",
  ".pnpm-store",
  "bower_components",
  "dist",
  "build",
  "out",
  "coverage",
  ".output",
  ".vercel",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
]);

const IGNORED_FILE_NAMES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  "npm-debug.log",
  "yarn-error.log",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "mdx",
  "rst",
  "adoc",
  "html",
  "htm",
  "xhtml",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env",
  "properties",
  "xml",
  "svg",
  "csv",
  "tsv",
  "graphql",
  "gql",
  "sql",
  "py",
  "pyi",
  "rb",
  "php",
  "java",
  "kt",
  "kts",
  "scala",
  "go",
  "rs",
  "c",
  "h",
  "cc",
  "cpp",
  "cxx",
  "hpp",
  "cs",
  "swift",
  "dart",
  "lua",
  "r",
  "pl",
  "sh",
  "bash",
  "zsh",
  "fish",
  "bat",
  "cmd",
  "ps1",
  "psm1",
  "dockerfile",
  "makefile",
  "mk",
  "gradle",
  "groovy",
  "vue",
  "svelte",
  "astro",
  "prisma",
  "proto",
  "rego",
  "tf",
  "tfvars",
  "hcl",
  "nix",
  "lock",
]);

const TEXT_FILE_NAMES = new Set([
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".npmrc",
  ".nvmrc",
  ".yarnrc",
  ".editorconfig",
  ".prettierrc",
  ".prettierignore",
  ".eslintrc",
  ".eslintignore",
  ".babelrc",
  ".browserslistrc",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  "dockerfile",
  "makefile",
  "procfile",
  "license",
  "licence",
  "readme",
  "changelog",
]);

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "ico",
  "bmp",
  "avif",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "wasm",
  "pdf",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "wav",
  "ogg",
  "flac",
  "zip",
  "gz",
  "tgz",
  "7z",
  "rar",
  "exe",
  "dll",
  "so",
  "dylib",
  "class",
  "jar",
  "sqlite",
  "db",
]);

function isBinaryFile(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const lowerName = file.name.toLowerCase();

  // Extension takes precedence: browsers sometimes report wrong MIME types
  // (e.g. .ts as video/mp2t), which must not turn source files into binaries.
  if (TEXT_EXTENSIONS.has(extension) || TEXT_FILE_NAMES.has(lowerName)) return false;
  if (!extension && !file.type) return false;
  if (BINARY_EXTENSIONS.has(extension)) return true;
  if (file.type.startsWith("image/") && extension !== "svg") return true;
  if (
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    file.type.startsWith("font/")
  ) {
    return true;
  }
  return (
    file.type === "application/pdf" ||
    file.type === "application/wasm" ||
    file.type === "application/octet-stream"
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Could not read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function addParentFolders(
  folderMap: Map<string, { path: string; name: string }>,
  filePath: string
) {
  const parts = filePath.split("/");
  for (let index = 1; index < parts.length; index++) {
    const path = parts.slice(0, index).join("/");
    if (!folderMap.has(path)) {
      folderMap.set(path, { path, name: parts[index - 1] });
    }
  }
}

async function scanDirectoryHandle(
  root: DirectoryHandleLike,
  onProgress?: ProgressCallback
): Promise<FolderSelection> {
  const files: FolderSourceFile[] = [];
  const folderMap = new Map<string, { path: string; name: string }>();
  const excludedPaths: string[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;
  let excludedCount = 0;

  const reportScan = (currentPath: string) => {
    onProgress?.({
      phase: "scanning",
      message: `Scanning ${root.name}...`,
      folderName: root.name,
      filesFound: files.length,
      foldersFound: folderMap.size,
      totalFiles: 0,
      totalBytes,
      processedFiles: 0,
      uploadedBytes: 0,
      currentPath,
      excludedCount,
      excludedPaths,
      warnings,
    });
  };

  const visit = async (directory: DirectoryHandleLike, currentPath: string, depth: number) => {
    if (depth > MAX_DEPTH) {
      throw new Error(`The selected folder is nested deeper than ${MAX_DEPTH} levels.`);
    }

    const entries: DirectoryEntryLike[] = [];
    for await (const entry of directory.values()) {
      entries.push(entry);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

      if (entry.kind === "directory") {
        if (IGNORED_DIR_NAMES.has(entry.name.toLowerCase())) {
          excludedCount++;
          if (excludedPaths.length < 25) excludedPaths.push(entryPath);
          continue;
        }

        if (!folderMap.has(entryPath)) {
          if (folderMap.size >= MAX_FOLDERS) {
            throw new Error(`The selected folder contains more than ${MAX_FOLDERS} folders.`);
          }
          folderMap.set(entryPath, { path: entryPath, name: entry.name });
        }
        await visit(entry, entryPath, depth + 1);
        continue;
      }

      if (IGNORED_FILE_NAMES.has(entry.name.toLowerCase())) {
        excludedCount++;
        if (excludedPaths.length < 25) excludedPaths.push(entryPath);
        continue;
      }

      let file: File;
      try {
        file = await entry.getFile();
      } catch {
        throw new Error(
          `Could not read "${entryPath}". Check the folder permissions and try again.`
        );
      }

      if (file.size > MAX_FILE_BYTES) {
        throw new Error(
          `"${entryPath}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ` +
            `Individual imported files are limited to ${MAX_FILE_BYTES / (1024 * 1024)} MB.`
        );
      }

      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          `The selected folder exceeds the ${MAX_TOTAL_BYTES / (1024 * 1024)} MB import limit.`
        );
      }
      if (files.length >= MAX_FILES) {
        throw new Error(`The selected folder contains more than ${MAX_FILES} files.`);
      }

      addParentFolders(folderMap, entryPath);
      files.push({
        path: entryPath,
        name: entry.name,
        size: file.size,
        type: file.type,
        getFile: () => entry.getFile(),
      });

      if (files.length % 25 === 0) reportScan(entryPath);
    }
  };

  reportScan("");
  await visit(root, "", 0);

  if (files.length === 0) {
    throw new Error("The selected folder does not contain any importable files.");
  }

  return {
    name: root.name || "Imported Project",
    files,
    folders: Array.from(folderMap.values()),
    totalBytes,
    excludedCount,
    excludedPaths,
    warnings,
  };
}

async function pickFolderWithInput(
  onProgress?: ProgressCallback
): Promise<FolderSelection | null> {
  return new Promise<FolderSelection | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.display = "none";

    let settled = false;
    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      input.remove();
    };
    const finish = (selection: FolderSelection | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(selection);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleCancel = () => finish(null);
    const handleChange = async () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        finish(null);
        return;
      }

      try {
        const files: FolderSourceFile[] = [];
        const folderMap = new Map<string, { path: string; name: string }>();
        let totalBytes = 0;
        let rootName = "Imported Project";

        for (let index = 0; index < fileList.length; index++) {
          const file = fileList[index];
          const rawPath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
          const parts = rawPath.split("/");
          if (parts.length > 1 && rootName === "Imported Project") {
            rootName = parts[0];
          }

          const relativePath = parts.length > 1 ? parts.slice(1).join("/") : rawPath;
          if (!relativePath) continue;

          const lowerSegments = relativePath.toLowerCase().split("/");
          const folderIndex = lowerSegments.findIndex((segment) =>
            IGNORED_DIR_NAMES.has(segment)
          );
          if (folderIndex !== -1) continue;
          if (IGNORED_FILE_NAMES.has(file.name.toLowerCase())) continue;

          const filePath = relativePath;
          if (file.size > MAX_FILE_BYTES) {
            throw new Error(
              `"${filePath}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ` +
                `Individual imported files are limited to ${MAX_FILE_BYTES / (1024 * 1024)} MB.`
            );
          }

          totalBytes += file.size;
          if (totalBytes > MAX_TOTAL_BYTES) {
            throw new Error(
              `The selected folder exceeds the ${MAX_TOTAL_BYTES / (1024 * 1024)} MB import limit.`
            );
          }
          if (files.length >= MAX_FILES) {
            throw new Error(`The selected folder contains more than ${MAX_FILES} files.`);
          }

          addParentFolders(folderMap, filePath);
          files.push({
            path: filePath,
            name: file.name,
            size: file.size,
            type: file.type,
            getFile: async () => file,
          });
        }

        if (files.length === 0) {
          throw new Error("The selected folder does not contain any importable files.");
        }

        const excludedCount = fileList.length - files.length;
        onProgress?.({
          phase: "scanning",
          message: `Scanned ${files.length} files.`,
          folderName: rootName,
          filesFound: files.length,
          foldersFound: folderMap.size,
          totalFiles: files.length,
          totalBytes,
          processedFiles: 0,
          uploadedBytes: 0,
          excludedCount,
          excludedPaths: [],
          warnings: [
            "Folder-input fallback cannot detect empty folders. Chromium's native directory picker preserves them.",
          ],
        });

        finish({
          name: rootName,
          files,
          folders: Array.from(folderMap.values()),
          totalBytes,
          excludedCount,
          excludedPaths: [],
          warnings: [
            "Folder-input fallback cannot detect empty folders. Chromium's native directory picker preserves them.",
          ],
        });
      } catch (error) {
        fail(error);
      }
    };

    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Opens the real OS folder picker. Chromium-based browsers use the File System
 * Access API; other browsers fall back to the standard webkitdirectory input.
 */
export async function pickLocalFolder(
  onProgress?: ProgressCallback
): Promise<FolderSelection | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options?: {
        mode?: "read" | "readwrite";
      }) => Promise<DirectoryHandleLike>;
    }
  ).showDirectoryPicker;

  if (typeof picker === "function") {
    try {
      onProgress?.({
        phase: "selecting",
        message: "Choose a project folder...",
        filesFound: 0,
        foldersFound: 0,
        totalFiles: 0,
        totalBytes: 0,
        processedFiles: 0,
        uploadedBytes: 0,
        excludedCount: 0,
        excludedPaths: [],
        warnings: [],
      });
      const handle = await picker({ mode: "read" });
      return await scanDirectoryHandle(handle, onProgress);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return null;
      }
      // A browser may expose the API but block it (e.g. insecure context).
      console.warn("[Import] Native directory picker failed; trying fallback.", error);
    }
  }

  return pickFolderWithInput(onProgress);
}

async function readFileForImport(file: File): Promise<string> {
  if (isBinaryFile(file)) {
    return readAsDataUrl(file);
  }

  const text = await file.text();
  if (text.includes("\0")) {
    return readAsDataUrl(file);
  }
  return text;
}

const textEncoder = new TextEncoder();

function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function splitContentForUpload(content: string): string[] {
  if (content.length === 0) return [""];

  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + MAX_CHUNK_CONTENT_CHARS, content.length);
    if (end < content.length) {
      const lastCode = content.charCodeAt(end - 1);
      if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
        end--;
      }
    }
    chunks.push(content.slice(start, end));
    start = end;
  }
  return chunks;
}

function makeProgress(
  selection: FolderSelection,
  overrides: Partial<FolderImportProgress> & Pick<FolderImportProgress, "phase" | "message">
): FolderImportProgress {
  return {
    folderName: selection.name,
    filesFound: selection.files.length,
    foldersFound: selection.folders.length,
    totalFiles: selection.files.length,
    totalBytes: selection.totalBytes,
    processedFiles: 0,
    uploadedBytes: 0,
    excludedCount: selection.excludedCount,
    excludedPaths: selection.excludedPaths,
    warnings: selection.warnings,
    ...overrides,
  };
}

/**
 * Persists a selected folder as a Code Editor project. The original folder is
 * only read; all edits are stored in the Code Editor database and workspace.
 */
export async function importFolderSelection(
  selection: FolderSelection,
  onProgress?: ProgressCallback
): Promise<FolderImportResult> {
  let projectId: string | null = null;
  let uploadedFiles = 0;
  let sentFiles = 0;
  let uploadedFolders = 0;
  let uploadedBytes = 0;

  const report = (
    overrides: Partial<FolderImportProgress> & Pick<FolderImportProgress, "phase" | "message">
  ) => {
    onProgress?.(
      makeProgress(selection, {
        processedFiles: uploadedFiles,
        uploadedBytes,
        ...overrides,
      })
    );
  };

  try {
    report({
      phase: "creating",
      message: `Creating project "${selection.name}"...`,
    });

    const description =
      `Imported from local folder "${selection.name}". This is a copy stored in Code Editor storage; ` +
      "edits do not modify the original folder.";

    const started = await cloudApi.projects.beginFolderImport({
      name: selection.name,
      description,
    });
    projectId = started.project.id;

    // Create folders first, including empty ones.
    for (let index = 0; index < selection.folders.length; index += 250) {
      const folderBatch = selection.folders.slice(index, index + 250);
      const batch = folderBatch.map((folder) => ({
        name: folder.name,
        path: folder.path,
        content: "",
        isFolder: true,
      }));
      let result: { files: number; folders: number };
      try {
        result = await cloudApi.projects.appendImportFiles(projectId, batch);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Folder batch ${index + 1}-${index + batch.length} failed at "${folderBatch[0]?.path}": ${message}`
        );
      }
      uploadedFolders += result.folders;
      report({
        phase: "uploading",
        message: `Creating folders (${uploadedFolders}/${selection.folders.length})...`,
        currentPath: selection.folders[index]?.path,
      });
    }

    let batch: ProjectImportFile[] = [];
    let batchBytes = 0;

    const flush = async () => {
      if (!projectId || batch.length === 0) return;
      const currentBatch = batch;
      const firstIndex = sentFiles + 1;
      const lastIndex = sentFiles + currentBatch.length;
      batch = [];
      batchBytes = 0;
      try {
        const result = await cloudApi.projects.appendImportFiles(projectId, currentBatch);
        sentFiles += result.files;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `File batch ${firstIndex}-${lastIndex} failed at "${currentBatch[0]?.path}": ${message}`
        );
      }
    };

    const uploadLargeFile = async (
      entry: FolderSourceFile,
      file: File,
      content: string,
      binary: boolean
    ) => {
      if (!projectId) throw new Error("Import project was not created.");
      if (batch.length > 0) await flush();

      const chunks = splitContentForUpload(content);
      if (chunks.length > MAX_CHUNKS_PER_FILE) {
        throw new Error(
          `"${entry.path}" requires ${chunks.length} upload chunks, but the limit is ${MAX_CHUNKS_PER_FILE}.`
        );
      }

      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const uploadId = Array.from(randomBytes, (value) =>
        value.toString(16).padStart(2, "0")
      ).join("");
      const binaryFile = binary;
      const mimeType = file.type || (binaryFile ? "application/octet-stream" : "text/plain");

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        report({
          phase: "uploading",
          message: `Uploading large file "${entry.path}" (${chunkIndex + 1}/${chunks.length})...`,
          currentPath: entry.path,
        });
        try {
          const result = await cloudApi.projects.appendImportChunk(projectId, {
            uploadId,
            path: entry.path,
            name: entry.name,
            chunk: chunks[chunkIndex],
            index: chunkIndex,
            totalChunks: chunks.length,
            totalChars: content.length,
            isBinary: binaryFile,
            mimeType,
          });
          if (result.complete) {
            sentFiles += result.files;
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Large file "${entry.path}" chunk ${chunkIndex + 1}/${chunks.length} failed: ${message}`
          );
        }
      }

      uploadedBytes += file.size;
      uploadedFiles++;
      report({
        phase: "uploading",
        message: `Importing files (${uploadedFiles}/${selection.files.length})...`,
        currentPath: entry.path,
      });
    };

    for (let index = 0; index < selection.files.length; index++) {
      const entry = selection.files[index];
      let file: File;
      try {
        file = await entry.getFile();
      } catch {
        throw new Error(
          `Could not read "${entry.path}". Check the folder permissions and try again.`
        );
      }

      const content = await readFileForImport(file);
      const binary = isBinaryFile(file);
      const importFile: ProjectImportFile = {
        name: entry.name,
        path: entry.path,
        content,
        isFolder: false,
        size: file.size,
        mimeType: file.type,
        isBinary: binary,
      };
      const importFileBytes = utf8ByteLength(JSON.stringify(importFile)) + 1;

      if (importFileBytes + 32 > MAX_BATCH_BODY_BYTES) {
        await uploadLargeFile(entry, file, content, binary);
        continue;
      }

      if (
        batch.length > 0 &&
        (batch.length >= MAX_BATCH_FILES ||
          batchBytes + importFileBytes > MAX_BATCH_BODY_BYTES)
      ) {
        await flush();
      }

      batch.push(importFile);
      batchBytes += importFileBytes;
      uploadedBytes += file.size;
      uploadedFiles++;

      if (uploadedFiles % 10 === 0 || uploadedFiles === selection.files.length) {
        report({
          phase: "uploading",
          message: `Importing files (${uploadedFiles}/${selection.files.length})...`,
          currentPath: entry.path,
        });
      }
    }

    await flush();

    report({
      phase: "finalizing",
      message: "Finalizing project and opening editor...",
    });

    const finalized = await cloudApi.projects.finalizeFolderImport(projectId);
    const resultProjectId = projectId;
    const projectName = finalized.project.name;

    report({
      phase: "done",
      message: `Imported ${finalized.project.fileCount} files. Opening editor...`,
    });

    return {
      projectId: resultProjectId,
      projectName,
      fileCount: finalized.project.fileCount,
      folderCount: selection.folders.length,
      totalBytes: selection.totalBytes,
      excludedCount: selection.excludedCount,
      excludedPaths: selection.excludedPaths,
      warnings: selection.warnings,
    };
  } catch (error) {
    if (projectId) {
      await cloudApi.projects.abortFolderImport(projectId).catch((cleanupError) => {
        console.error("[Import] Failed to clean up incomplete project:", cleanupError);
      });
    }
    throw error;
  }
}
