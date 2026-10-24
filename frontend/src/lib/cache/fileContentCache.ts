export interface CachedFileContent {
  content: string;
  version?: number;
}

interface CacheEntry extends CachedFileContent {
  key: string;
  weight: number;
  lastUsed: number;
}

const DEFAULT_MAX_ENTRIES = 24;
const DEFAULT_MAX_WEIGHT = 32 * 1024 * 1024;

class FileContentCache {
  private entries = new Map<string, CacheEntry>();
  private weight = 0;
  private clock = 0;

  constructor(
    private maxEntries = DEFAULT_MAX_ENTRIES,
    private maxWeight = DEFAULT_MAX_WEIGHT
  ) {}

  private key(projectId: string, fileId: string): string {
    return `${projectId}:${fileId}`;
  }

  get(projectId: string, fileId: string, version?: number): CachedFileContent | null {
    const key = this.key(projectId, fileId);
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (typeof version === "number" && typeof entry.version === "number" && entry.version !== version) {
      this.delete(projectId, fileId);
      return null;
    }

    entry.lastUsed = ++this.clock;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { content: entry.content, version: entry.version };
  }

  set(projectId: string, fileId: string, content: string, version?: number): void {
    const key = this.key(projectId, fileId);
    const existing = this.entries.get(key);
    if (existing) {
      this.weight -= existing.weight;
      this.entries.delete(key);
    }

    const weight = Math.max(content.length * 2, 1);
    const entry: CacheEntry = {
      key,
      content,
      version,
      weight,
      lastUsed: ++this.clock,
    };
    this.entries.set(key, entry);
    this.weight += weight;
    this.trim();
  }

  delete(projectId: string, fileId: string): void {
    const key = this.key(projectId, fileId);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.weight -= entry.weight;
    this.entries.delete(key);
  }

  deleteProject(projectId: string): void {
    const prefix = `${projectId}:`;
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(prefix)) continue;
      this.weight -= entry.weight;
      this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.weight = 0;
  }

  stats(): { entries: number; weight: number; maxEntries: number; maxWeight: number } {
    return {
      entries: this.entries.size,
      weight: this.weight,
      maxEntries: this.maxEntries,
      maxWeight: this.maxWeight,
    };
  }

  private trim(): void {
    while (
      this.entries.size > this.maxEntries ||
      (this.weight > this.maxWeight && this.entries.size > 1)
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.entries.get(oldestKey);
      if (!oldest) break;
      this.weight -= oldest.weight;
      this.entries.delete(oldestKey);
    }
  }
}

export const fileContentCache = new FileContentCache();
export { FileContentCache };
