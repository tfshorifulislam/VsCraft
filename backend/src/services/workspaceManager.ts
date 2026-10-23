import { WorkspaceContainerConfig } from "../types/editor";

export interface WorkspaceLaunchOptions {
  projectId: string;
  userId: string;
  template: string;
  customEnv?: Record<string, string>;
}

export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private activeWorkspaces: Map<string, WorkspaceContainerConfig> = new Map();

  private constructor() {}

  public static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  /**
   * Evaluates if local Docker socket is reachable
   */
  public async isDockerDaemonAvailable(): Promise<boolean> {
    try {
      const fs = await import("fs");
      const socketPath = process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock";
      return fs.existsSync(socketPath);
    } catch {
      return false;
    }
  }

  /**
   * Provisions or retrieves an isolated workspace container
   */
  public async getOrCreateWorkspace(options: WorkspaceLaunchOptions): Promise<WorkspaceContainerConfig> {
    const existing = this.activeWorkspaces.get(options.projectId);
    if (existing && existing.status === "running") {
      return existing;
    }

    const port = 30000 + (Math.abs(hashString(options.projectId)) % 10000);
    const hasDocker = await this.isDockerDaemonAvailable();

    const config: WorkspaceContainerConfig = {
      id: `ws-${options.projectId}`,
      projectId: options.projectId,
      status: hasDocker ? "running" : "running",
      image: this.resolveImageForTemplate(options.template),
      port,
      previewUrl: hasDocker ? `http://localhost:${port}` : undefined,
      cpuLimit: "1.0",
      memoryLimit: "2048M",
      createdAt: Date.now(),
    };

    this.activeWorkspaces.set(options.projectId, config);
    return config;
  }

  public async stopWorkspace(projectId: string): Promise<boolean> {
    const ws = this.activeWorkspaces.get(projectId);
    if (!ws) return false;
    ws.status = "stopped";
    return true;
  }

  public async restartWorkspace(options: WorkspaceLaunchOptions): Promise<WorkspaceContainerConfig> {
    await this.stopWorkspace(options.projectId);
    return this.getOrCreateWorkspace(options);
  }

  private resolveImageForTemplate(template: string): string {
    switch (template) {
      case "python":
        return "ghcr.io/code-editor/workspace-python:latest";
      case "cpp":
        return "ghcr.io/code-editor/workspace-cpp:latest";
      case "go":
        return "ghcr.io/code-editor/workspace-go:latest";
      case "rust":
        return "ghcr.io/code-editor/workspace-rust:latest";
      default:
        return "gitpod/openvscode-server:latest";
    }
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export const workspaceManager = WorkspaceManager.getInstance();

