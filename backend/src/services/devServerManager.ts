import { ChildProcess, spawn, execSync } from "child_process";
import http from "http";
import net from "net";
import path from "path";
import fsp from "fs/promises";
import { getWorkspaceDir } from "./workspaceDisk";
import { getSanitizedWorkspaceEnv } from "./workspaceEnv";

export type ProjectFramework = "nextjs" | "vite" | "node" | "static" | "python" | "unknown";
export type DevServerStatus = "stopped" | "starting" | "running" | "error";

export interface DevServerInstance {
  projectId: string;
  port: number;
  url: string;
  status: DevServerStatus;
  framework: ProjectFramework;
  childProcess?: ChildProcess;
  staticServer?: http.Server;
  logs: string[];
  startTime?: number;
  error?: string;
}

// Global in-memory registry of running project dev servers
const runningServers = new Map<string, DevServerInstance>();

/**
 * Finds an available port in the 3100-3900 range.
 */
export function findAvailablePort(startPort: number = 3100): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}

/**
 * Detects the runtime framework and entrypoint from the workspace files.
 */
export async function detectProjectFramework(workspaceDir: string): Promise<{
  framework: ProjectFramework;
  entryFile?: string;
  hasPackageJson: boolean;
}> {
  try {
    const pkgPath = path.join(workspaceDir, "package.json");
    let pkgJson: Record<string, unknown> = {};
    let hasPackageJson = false;

    try {
      const raw = await fsp.readFile(pkgPath, "utf-8");
      pkgJson = JSON.parse(raw);
      hasPackageJson = true;
    } catch {
      hasPackageJson = false;
    }

    const deps = (pkgJson.dependencies as Record<string, string>) || {};
    const devDeps = (pkgJson.devDependencies as Record<string, string>) || {};

    // 1. Next.js Check
    if (deps["next"] || devDeps["next"]) {
      return { framework: "nextjs", hasPackageJson };
    }
    const hasNextConfig =
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "next.config.ts")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "next.config.js")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "next.config.mjs")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "app", "page.tsx")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "src", "app", "page.tsx")).then(() => true).catch(() => false));

    if (hasNextConfig) {
      return { framework: "nextjs", hasPackageJson };
    }

    // 2. Vite / React Check
    if (deps["vite"] || devDeps["vite"]) {
      return { framework: "vite", hasPackageJson };
    }
    const hasViteConfig =
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "vite.config.ts")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "vite.config.js")).then(() => true).catch(() => false));
    if (hasViteConfig) {
      return { framework: "vite", hasPackageJson };
    }

    // 3. Node.js API Check
    const mainFile = (pkgJson.main as string) || "server.js";
    if (
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, mainFile)).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "server.js")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "index.js")).then(() => true).catch(() => false))
    ) {
      return { framework: "node", entryFile: mainFile, hasPackageJson };
    }

    // 4. Static HTML Check
    const hasHtml = await fsp.access(path.join(/*turbopackIgnore: true*/ workspaceDir, "index.html")).then(() => true).catch(() => false);
    if (hasHtml) {
      return { framework: "static", entryFile: "index.html", hasPackageJson };
    }

    // 5. Python Check
    const hasPython =
      (await fsp.access(path.join(workspaceDir, "main.py")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(workspaceDir, "app.py")).then(() => true).catch(() => false));
    if (hasPython) {
      return { framework: "python", entryFile: "main.py", hasPackageJson };
    }

    return { framework: "unknown", hasPackageJson };
  } catch {
    return { framework: "unknown", hasPackageJson: false };
  }
}

/**
 * Terminates a child process tree cleanly across platforms.
 */
function killProcessTree(child: ChildProcess): void {
  if (!child || !child.pid) return;
  const isWindows = process.platform === "win32";

  try {
    if (isWindows) {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
}

/**
 * Starts the real project dev server in the workspace directory.
 */
export async function startDevServer(projectId: string): Promise<DevServerInstance> {
  const existing = runningServers.get(projectId);
  if (existing && (existing.status === "running" || existing.status === "starting")) {
    return existing;
  }

  // Stop any previous stale process
  if (existing) {
    await stopDevServer(projectId);
  }

  const workspaceDir = getWorkspaceDir(projectId);
  await fsp.mkdir(workspaceDir, { recursive: true });

  const { framework, entryFile } = await detectProjectFramework(workspaceDir);
  const port = await findAvailablePort(3100);
  const url = `http://localhost:${port}`;

  const instance: DevServerInstance = {
    projectId,
    port,
    url,
    status: "starting",
    framework,
    logs: [
      `[DevServer] Initializing runtime for project ${projectId}...`,
      `[DevServer] Detected framework: ${framework}`,
      `[DevServer] Allocated local port: ${port}`,
    ],
    startTime: Date.now(),
  };

  runningServers.set(projectId, instance);

  // 1. Static HTML File Server
  if (framework === "static") {
    try {
      const staticServer = http.createServer(async (req, res) => {
        try {
          const reqPath = req.url?.split("?")[0] || "/";
          const relPath = reqPath === "/" ? "index.html" : reqPath.replace(/^\//, "");
          const filePath = path.join(workspaceDir, relPath);

          const stat = await fsp.stat(filePath);
          if (stat.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              ".html": "text/html; charset=utf-8",
              ".js": "application/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8",
              ".json": "application/json",
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".svg": "image/svg+xml",
            };

            res.writeHead(200, {
              "Content-Type": mimeTypes[ext] || "text/plain",
              "Access-Control-Allow-Origin": "*",
            });
            const content = await fsp.readFile(filePath);
            return res.end(content);
          }
        } catch {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
        }
      });

      await new Promise<void>((resolve, reject) => {
        staticServer.listen(port, () => {
          instance.staticServer = staticServer;
          instance.status = "running";
          instance.logs.push(`✓ [Static Web Server] Serving ${workspaceDir} on ${url}`);
          resolve();
        });
        staticServer.on("error", reject);
      });

      return instance;
    } catch (err) {
      instance.status = "error";
      instance.error = String(err);
      return instance;
    }
  }

  // 2. Spawn Real Framework Server (Next.js, Vite, Node)
  let cmd = "npx";
  let args: string[] = [];

  if (framework === "nextjs") {
    args = ["next", "dev", "-p", String(port)];
  } else if (framework === "vite") {
    args = ["vite", "--port", String(port), "--host", "127.0.0.1"];
  } else if (framework === "node") {
    cmd = "node";
    args = [entryFile || "server.js"];
  } else {
    // Generic fallback: check if package.json has "dev" script
    args = ["next", "dev", "-p", String(port)];
  }

  instance.logs.push(`[DevServer] Executing: ${cmd} ${args.join(" ")} in ${workspaceDir}`);

  const isWindows = process.platform === "win32";
  const child = spawn(cmd, args, {
    cwd: workspaceDir,
    shell: isWindows,
    env: getSanitizedWorkspaceEnv(projectId, workspaceDir, {
      PORT: String(port),
    }),
  });

  instance.childProcess = child;

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const l of lines) {
      instance.logs.push(l);
      if (instance.logs.length > 200) instance.logs.shift();
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const l of lines) {
      instance.logs.push(`[stderr] ${l}`);
      if (instance.logs.length > 200) instance.logs.shift();
    }
  });

  child.on("error", (err) => {
    instance.status = "error";
    instance.error = err.message;
    instance.logs.push(`❌ [Process Error] ${err.message}`);
  });

  child.on("exit", (code, signal) => {
    if (instance.status === "running" || instance.status === "starting") {
      instance.status = "stopped";
      instance.logs.push(`[Process Exited] code=${code} signal=${signal}`);
    }
  });

  // Probe until server responds with HTTP
  let attempts = 0;
  const maxAttempts = 50; // 25 seconds (50 * 500ms)

  await new Promise<void>((resolve) => {
    const checkInterval = setInterval(() => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        // Any HTTP response (including 200, 304, 404, 500) confirms dev server is listening!
        clearInterval(checkInterval);
        instance.status = "running";
        instance.logs.push(`✓ [DevServer Ready] Service responding with HTTP ${res.statusCode} on ${url}`);
        resolve();
      });

      req.on("error", () => {
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          if (instance.status === "starting") {
            // Did not respond in 25s, mark as error or leave starting
            instance.status = "error";
            instance.error = "Dev server timed out during startup probe.";
            instance.logs.push("❌ [Timeout] Dev server took longer than 25 seconds to respond.");
          }
          resolve();
        }
      });

      req.setTimeout(400, () => {
        req.destroy();
      });
    }, 500);
  });

  return instance;
}

/**
 * Stops the dev server process and cleans up resources.
 */
export async function stopDevServer(projectId: string): Promise<DevServerInstance | null> {
  const instance = runningServers.get(projectId);
  if (!instance) return null;

  if (instance.childProcess) {
    killProcessTree(instance.childProcess);
  }

  if (instance.staticServer) {
    await new Promise<void>((resolve) => {
      instance.staticServer?.close(() => resolve());
    });
  }

  instance.status = "stopped";
  instance.logs.push("[DevServer] Process stopped.");
  runningServers.delete(projectId);

  return instance;
}

/**
 * Restarts the project dev server.
 */
export async function restartDevServer(projectId: string): Promise<DevServerInstance> {
  await stopDevServer(projectId);
  return startDevServer(projectId);
}

/**
 * Retrieves current status and logs for a project's dev server.
 */
export function getDevServerStatus(projectId: string): {
  status: DevServerStatus;
  port?: number;
  url?: string;
  framework?: ProjectFramework;
  logs: string[];
  error?: string;
} {
  const instance = runningServers.get(projectId);
  if (!instance) {
    return {
      status: "stopped",
      logs: [],
    };
  }

  return {
    status: instance.status,
    port: instance.port,
    url: instance.url,
    framework: instance.framework,
    logs: instance.logs,
    error: instance.error,
  };
}

// Global cleanup hook
process.on("exit", () => {
  for (const instance of runningServers.values()) {
    if (instance.childProcess) killProcessTree(instance.childProcess);
    if (instance.staticServer) instance.staticServer.close();
  }
});
