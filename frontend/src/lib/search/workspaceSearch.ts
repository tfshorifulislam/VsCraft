import type { ProjectFile } from "../../types/editor";

export interface WorkspaceSearchResult {
  id: string;
  name: string;
  path: string;
  match: "path" | "content";
}

const DEFAULT_INDEX_EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".angular",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  ".output",
  ".vercel",
  ".cache",
  "target",
  "vendor",
  "bower_components",
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
  "pdf",
  "zip",
  "gz",
  "tar",
  "7z",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "wasm",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "webm",
]);

interface IndexEntry {
  file: ProjectFile;
  nameLower: string;
  pathLower: string;
  excluded: boolean;
  binary: boolean;
}

const MAX_CONTENT_SEARCH_CHARS = 16 * 1024 * 1024;

export function isDefaultIndexExcludedPath(path: string): boolean {
  const segments = path.toLowerCase().split("/");
  return segments.some((segment) => DEFAULT_INDEX_EXCLUDED_SEGMENTS.has(segment));
}

export function isBinarySearchPath(path: string): boolean {
  const last = path.split("/").pop() || path;
  if (last.startsWith(".")) return false;
  const extension = last.split(".").pop()?.toLowerCase() || "";
  return BINARY_EXTENSIONS.has(extension);
}

export class WorkspaceSearchIndex {
  private entries = new Map<string, IndexEntry>();
  private ordered: IndexEntry[] = [];
  private lastContentTruncated = false;

  update(files: ProjectFile[]): void {
    const nextIds = new Set<string>();
    for (const file of files) {
      if (file.isFolder) continue;
      nextIds.add(file.id);
      const existing = this.entries.get(file.id);
      if (existing?.file === file) continue;
      this.entries.set(file.id, {
        file,
        nameLower: file.name.toLowerCase(),
        pathLower: file.path.toLowerCase(),
        excluded: isDefaultIndexExcludedPath(file.path),
        binary: isBinarySearchPath(file.path),
      });
    }

    for (const id of this.entries.keys()) {
      if (!nextIds.has(id)) this.entries.delete(id);
    }

    this.ordered = [];
    for (const file of files) {
      if (file.isFolder) continue;
      const entry = this.entries.get(file.id);
      if (entry) this.ordered.push(entry);
    }
  }

  search(query: string, maxResults = 200): WorkspaceSearchResult[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const includeIgnored = needle
      .split("/")
      .some((segment) => DEFAULT_INDEX_EXCLUDED_SEGMENTS.has(segment));
    const pathResults: WorkspaceSearchResult[] = [];
    const contentResults: WorkspaceSearchResult[] = [];
    const searchContent = needle.length >= 2;
    let contentCharsScanned = 0;
    let contentBudgetExhausted = false;
    this.lastContentTruncated = false;

    for (const entry of this.ordered) {
      if (pathResults.length >= maxResults) break;
      if (!includeIgnored && entry.excluded) continue;

      if (entry.nameLower.includes(needle) || entry.pathLower.includes(needle)) {
        pathResults.push({
          id: entry.file.id,
          name: entry.file.name,
          path: entry.file.path,
          match: "path",
        });
        continue;
      }

      if (!searchContent || contentBudgetExhausted || entry.binary) continue;
      const content = entry.file.content;
      if (!content || content.startsWith("data:")) continue;
      if (contentCharsScanned + content.length > MAX_CONTENT_SEARCH_CHARS) {
        contentBudgetExhausted = true;
        this.lastContentTruncated = true;
        continue;
      }
      contentCharsScanned += content.length;
      if (content.toLowerCase().includes(needle)) {
        contentResults.push({
          id: entry.file.id,
          name: entry.file.name,
          path: entry.file.path,
          match: "content",
        });
      }
    }

    return pathResults
      .concat(contentResults)
      .slice(0, maxResults);
  }

  stats(): { files: number; lastContentTruncated: boolean } {
    return {
      files: this.entries.size,
      lastContentTruncated: this.lastContentTruncated,
    };
  }
}
