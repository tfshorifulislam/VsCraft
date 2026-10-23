import fsp from "fs/promises";
import path from "path";
import { ProjectTemplate } from "../types/editor";
import { getWorkspaceDir, resolveSafePath } from "./workspaceDisk";

export interface DetectedProject {
  path: string; // Relative path inside workspace: "" for root, "my-app" for subfolder
  name: string;
  template: ProjectTemplate;
  frameworkLabel: string;
  fileCount: number;
  entryFile?: string;
  packageManager?: string;
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  ".vscode",
  "coverage",
]);

/**
 * Counts non-ignored files inside a directory recursively.
 */
async function countFilesRecursively(dir: string, maxDepth: number = 4): Promise<number> {
  if (maxDepth <= 0) return 0;
  let count = 0;

  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += await countFilesRecursively(path.join(dir, entry.name), maxDepth - 1);
      }
    }
  } catch {
    return 0;
  }

  return count;
}

/**
 * Inspects a specific directory for project manifest files and determines framework.
 */
async function inspectDirectoryForProject(
  dirPath: string,
  relativePath: string
): Promise<DetectedProject | null> {
  try {
    const pkgPath = path.join(dirPath, "package.json");
    let hasPkg = false;
    let pkgJson: Record<string, unknown> = {};

    try {
      const raw = await fsp.readFile(pkgPath, "utf-8");
      pkgJson = JSON.parse(raw);
      hasPkg = true;
    } catch {
      hasPkg = false;
    }

    const deps = (pkgJson.dependencies as Record<string, string>) || {};
    const devDeps = (pkgJson.devDependencies as Record<string, string>) || {};
    const folderName = path.basename(dirPath);
    const projName = (pkgJson.name as string) || folderName;

    // 1. Next.js App Router or Pages
    const hasNextConfig =
      deps["next"] ||
      devDeps["next"] ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "next.config.ts")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "next.config.js")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "next.config.mjs")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "app", "page.tsx")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "src", "app", "page.tsx")).then(() => true).catch(() => false));

    if (hasNextConfig) {
      let entryFile = "app/page.tsx";
      if (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "src", "app", "page.tsx")).then(() => true).catch(() => false)) {
        entryFile = "src/app/page.tsx";
      }
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: projName,
        template: "next-app",
        frameworkLabel: "Next.js App Router (TypeScript / React 19)",
        fileCount,
        entryFile,
        packageManager: "npm",
      };
    }

    // 2. Vite + React
    const hasVite =
      deps["vite"] ||
      devDeps["vite"] ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "vite.config.ts")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "vite.config.js")).then(() => true).catch(() => false));

    if (hasVite) {
      let entryFile = "src/App.tsx";
      if (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "src", "App.jsx")).then(() => true).catch(() => false)) {
        entryFile = "src/App.jsx";
      }
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: projName,
        template: "react-ts",
        frameworkLabel: "React + Vite (Frontend Application)",
        fileCount,
        entryFile,
        packageManager: "npm",
      };
    }

    // 3. Node.js API Service
    const hasNodeServer =
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "server.js")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "index.js")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "src", "index.ts")).then(() => true).catch(() => false));

    if (hasPkg && (hasNodeServer || deps["express"] || deps["fastify"] || deps["koa"])) {
      let entryFile = "server.js";
      if (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "src", "index.ts")).then(() => true).catch(() => false)) {
        entryFile = "src/index.ts";
      } else if (await fsp.access(path.join(/*turbopackIgnore: true*/ dirPath, "index.js")).then(() => true).catch(() => false)) {
        entryFile = "index.js";
      }
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: projName,
        template: "node-api",
        frameworkLabel: "Node.js REST API Server",
        fileCount,
        entryFile,
        packageManager: "npm",
      };
    }

    // 4. Generic Node.js package
    if (hasPkg) {
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: projName,
        template: "node-api",
        frameworkLabel: "Node.js Application",
        fileCount,
        entryFile: (pkgJson.main as string) || "package.json",
        packageManager: "npm",
      };
    }

    // 5. Python Project
    const hasPython =
      (await fsp.access(path.join(dirPath, "main.py")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(dirPath, "app.py")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(dirPath, "requirements.txt")).then(() => true).catch(() => false)) ||
      (await fsp.access(path.join(dirPath, "pyproject.toml")).then(() => true).catch(() => false));

    if (hasPython) {
      let entryFile = "main.py";
      if (await fsp.access(path.join(dirPath, "app.py")).then(() => true).catch(() => false)) {
        entryFile = "app.py";
      }
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: folderName,
        template: "python",
        frameworkLabel: "Python Application",
        fileCount,
        entryFile,
      };
    }

    // 6. Rust Project
    const hasCargo = await fsp.access(path.join(dirPath, "Cargo.toml")).then(() => true).catch(() => false);
    if (hasCargo) {
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: folderName,
        template: "rust",
        frameworkLabel: "Rust Cargo Package",
        fileCount,
        entryFile: "src/main.rs",
      };
    }

    // 7. Go Project
    const hasGo = await fsp.access(path.join(dirPath, "go.mod")).then(() => true).catch(() => false);
    if (hasGo) {
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: folderName,
        template: "go",
        frameworkLabel: "Go Module",
        fileCount,
        entryFile: "main.go",
      };
    }

    // 8. Static HTML
    const hasHtml = await fsp.access(path.join(dirPath, "index.html")).then(() => true).catch(() => false);
    if (hasHtml) {
      const fileCount = await countFilesRecursively(dirPath);
      return {
        path: relativePath,
        name: folderName,
        template: "vanilla-web",
        frameworkLabel: "Static Web (HTML/CSS/JS)",
        fileCount,
        entryFile: "index.html",
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Recursively scans a project workspace directory to detect any project roots.
 */
export async function detectProjectsInWorkspace(projectId: string): Promise<DetectedProject[]> {
  const workspaceDir = getWorkspaceDir(projectId);
  const detected: DetectedProject[] = [];

  // 1. Inspect workspace root first
  const rootProject = await inspectDirectoryForProject(workspaceDir, "");
  if (rootProject) {
    detected.push(rootProject);
  }

  // 2. Inspect immediate subdirectories (depth 1)
  try {
    const entries = await fsp.readdir(workspaceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;

      const subPath = path.join(workspaceDir, entry.name);
      const subProject = await inspectDirectoryForProject(subPath, entry.name);
      if (subProject) {
        detected.push(subProject);
      }
    }
  } catch {
    // Workspace directory might be empty
  }

  // 3. Fallback: if no project manifest found, count files to see if user created custom files
  if (detected.length === 0) {
    const rawCount = await countFilesRecursively(workspaceDir);
    if (rawCount > 0) {
      detected.push({
        path: "",
        name: path.basename(workspaceDir),
        template: "blank",
        frameworkLabel: "Custom Workspace",
        fileCount: rawCount,
      });
    }
  }

  return detected;
}

/**
 * Promotes a subfolder's contents to the workspace root.
 * E.g., if user created a project in `my-app`, this moves `my-app/*` to `.`
 */
export async function promoteSubfolderToRoot(projectId: string, subfolderRelPath: string): Promise<void> {
  if (!subfolderRelPath || subfolderRelPath === "." || subfolderRelPath === "/") return;

  const workspaceDir = getWorkspaceDir(projectId);
  const subfolderPath = resolveSafePath(projectId, subfolderRelPath);

  // Read all items in subfolder
  const entries = await fsp.readdir(subfolderPath);

  for (const item of entries) {
    const src = path.join(subfolderPath, item);
    const dest = path.join(workspaceDir, item);

    // If destination already exists, remove it first
    await fsp.rm(dest, { recursive: true, force: true }).catch(() => {});
    await fsp.rename(src, dest);
  }

  // Remove the now-empty subfolder
  await fsp.rmdir(subfolderPath).catch(() => {});
}

