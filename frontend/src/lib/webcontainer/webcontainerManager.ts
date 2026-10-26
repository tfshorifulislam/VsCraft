import type { FileSystemTree, WebContainer, WebContainerProcess } from "@webcontainer/api";

export interface WebContainerShellHandle {
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  exit: Promise<number>;
}

type ServerReadyCallback = (port: number, url: string) => void;
type PortCallback = (port: number, type: "open" | "close") => void;

class WebContainerManager {
  private instancePromise: Promise<WebContainer> | null = null;
  private currentProjectId: string | null = null;
  private isMounted = false;
  private serverReadyCallbacks = new Set<ServerReadyCallback>();
  private portCallbacks = new Set<PortCallback>();
  private latestServerUrl: string | null = null;
  private latestServerPort: number | null = null;
  private activePorts = new Set<number>();

  /**
   * Check whether the browser runtime supports WebContainers.
   * WebContainers require Cross-Origin Isolation (COOP and COEP headers).
   */
  public isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return typeof window.crossOriginIsolated === "boolean" ? window.crossOriginIsolated : false;
  }

  /**
   * Get or boot the singleton WebContainer instance.
   */
  public async getInstance(): Promise<WebContainer> {
    if (typeof window === "undefined") {
      throw new Error("WebContainer can only run in the browser.");
    }

    if (!this.instancePromise) {
      this.instancePromise = (async () => {
        const { WebContainer } = await import("@webcontainer/api");
        const instance = await WebContainer.boot();

        // Listen for server ready events (e.g. npm run dev, vite, express)
        instance.on("server-ready", (port, url) => {
          this.latestServerPort = port;
          this.latestServerUrl = url;
          this.activePorts.add(port);
          this.serverReadyCallbacks.forEach((cb) => {
            try {
              cb(port, url);
            } catch (err) {
              console.error("[WebContainer] server-ready callback error:", err);
            }
          });
        });

        // Listen for port changes
        instance.on("port", (port, type) => {
          if (type === "open") {
            this.activePorts.add(port);
          } else {
            this.activePorts.delete(port);
            if (this.latestServerPort === port) {
              this.latestServerUrl = null;
              this.latestServerPort = null;
            }
          }
          this.portCallbacks.forEach((cb) => {
            try {
              cb(port, type);
            } catch (err) {
              console.error("[WebContainer] port callback error:", err);
            }
          });
        });

        instance.on("error", ({ message }) => {
          console.error("[WebContainer] Internal error:", message);
        });

        return instance;
      })();
    }

    return this.instancePromise;
  }

  /**
   * Convert flat project files array into a hierarchical FileSystemTree.
   */
  public buildFileSystemTree(
    files: Array<{ path: string; content?: string | null; isFolder: boolean }>
  ): FileSystemTree {
    const root: FileSystemTree = {};

    for (const file of files) {
      if (file.isFolder) continue;

      const normalizedPath = file.path.replace(/^\/+/, "");
      if (!normalizedPath) continue;

      const parts = normalizedPath.split("/");
      let currentDir: any = root;

      for (let i = 0; i < parts.length - 1; i++) {
        const segment = parts[i];
        if (!currentDir[segment]) {
          currentDir[segment] = { directory: {} };
        } else if (!currentDir[segment].directory) {
          currentDir[segment] = { directory: {} };
        }
        currentDir = currentDir[segment].directory;
      }

      const fileName = parts[parts.length - 1];
      currentDir[fileName] = {
        file: {
          contents: file.content ?? "",
        },
      };
    }

    return root;
  }

  /**
   * Mount project files into the WebContainer virtual file system.
   */
  public async mountProject(
    projectId: string,
    files: Array<{ path: string; content?: string | null; isFolder: boolean }>
  ): Promise<void> {
    const container = await this.getInstance();
    const tree = this.buildFileSystemTree(files);

    await container.mount(tree);
    this.currentProjectId = projectId;
    this.isMounted = true;
  }

  public getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  public isProjectMounted(projectId: string): boolean {
    return this.isMounted && this.currentProjectId === projectId;
  }

  /**
   * Write or update a file in the WebContainer filesystem.
   */
  public async writeFile(filePath: string, content: string): Promise<void> {
    const container = await this.getInstance();
    const cleanPath = filePath.replace(/^\/+/, "");
    const segments = cleanPath.split("/");

    if (segments.length > 1) {
      const parentDir = segments.slice(0, -1).join("/");
      await container.fs.mkdir(parentDir, { recursive: true }).catch(() => {});
    }

    await container.fs.writeFile(cleanPath, content);
  }

  /**
   * Delete a file or directory from the WebContainer filesystem.
   */
  public async removeFile(filePath: string): Promise<void> {
    const container = await this.getInstance();
    const cleanPath = filePath.replace(/^\/+/, "");
    await container.fs.rm(cleanPath, { recursive: true, force: true }).catch(() => {});
  }

  /**
   * Rename or move a file in the WebContainer filesystem.
   */
  public async renameFile(oldPath: string, newPath: string): Promise<void> {
    const container = await this.getInstance();
    const cleanOld = oldPath.replace(/^\/+/, "");
    const cleanNew = newPath.replace(/^\/+/, "");

    const segments = cleanNew.split("/");
    if (segments.length > 1) {
      const parentDir = segments.slice(0, -1).join("/");
      await container.fs.mkdir(parentDir, { recursive: true }).catch(() => {});
    }

    // Read old content, write new, and delete old
    try {
      const content = await container.fs.readFile(cleanOld);
      await container.fs.writeFile(cleanNew, content);
      await container.fs.rm(cleanOld, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[WebContainer] Failed to rename ${oldPath} to ${newPath}:`, err);
    }
  }

  /**
   * Spawn an interactive terminal shell (jsh) inside the WebContainer.
   */
  public async spawnShell(options: {
    cols: number;
    rows: number;
    onData: (data: string) => void;
  }): Promise<WebContainerShellHandle> {
    const container = await this.getInstance();

    const proc = await container.spawn("jsh", {
      terminal: {
        cols: options.cols,
        rows: options.rows,
      },
    });

    proc.output.pipeTo(
      new WritableStream({
        write(data) {
          options.onData(data);
        },
      })
    );

    const inputWriter = proc.input.getWriter();

    return {
      write: async (data: string) => {
        await inputWriter.write(data);
      },
      resize: (cols: number, rows: number) => {
        try {
          proc.resize({ cols, rows });
        } catch (err) {
          console.warn("[WebContainer] Shell resize error:", err);
        }
      },
      kill: () => {
        try {
          proc.kill();
        } catch {}
      },
      exit: proc.exit,
    };
  }

  /**
   * Run a one-off command in the WebContainer (e.g. npm install, npm run dev).
   */
  public async runCommand(
    command: string,
    args: string[] = [],
    onData?: (data: string) => void
  ): Promise<{ exitCode: number; process: WebContainerProcess }> {
    const container = await this.getInstance();
    const proc = await container.spawn(command, args);

    if (onData) {
      proc.output.pipeTo(
        new WritableStream({
          write(data) {
            onData(data);
          },
        })
      );
    }

    const exitCode = await proc.exit;
    return { exitCode, process: proc };
  }

  /**
   * Subscribe to server-ready events.
   */
  public onServerReady(callback: ServerReadyCallback): () => void {
    this.serverReadyCallbacks.add(callback);
    // If a server is already ready, immediately notify the callback
    if (this.latestServerUrl && this.latestServerPort !== null) {
      try {
        callback(this.latestServerPort, this.latestServerUrl);
      } catch (err) {
        console.error("[WebContainer] Immediate server-ready callback error:", err);
      }
    }
    return () => {
      this.serverReadyCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to port open/close events.
   */
  public onPort(callback: PortCallback): () => void {
    this.portCallbacks.add(callback);
    return () => {
      this.portCallbacks.delete(callback);
    };
  }

  public getLatestServerUrl(): string | null {
    return this.latestServerUrl;
  }

  public getLatestServerPort(): number | null {
    return this.latestServerPort;
  }

  public getActivePorts(): number[] {
    return Array.from(this.activePorts);
  }
}

export const webcontainerManager = new WebContainerManager();

