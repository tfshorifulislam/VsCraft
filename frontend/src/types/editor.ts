export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "html"
  | "css"
  | "json"
  | "markdown"
  | "python"
  | "cpp"
  | "go"
  | "rust"
  | "java"
  | "plaintext";

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: SupportedLanguage | string;
  isFolder: boolean;
  parentId: string | null;
  version?: number;
  size?: number;
  mimeType?: string;
  isBinary?: boolean;
}

export type ProjectTemplate =
  | "react-ts"
  | "vanilla-web"
  | "next-app"
  | "node-api"
  | "python"
  | "cpp"
  | "go"
  | "rust"
  | "blank";

export type ProjectCreationType = "blank" | "template";
export type BlankSubtype = "empty" | "basic-web";

export interface NextJsConfig {
  typescript: boolean;
  tailwind: boolean;
  shadcn: boolean;
  eslint: boolean;
  packageManager: "npm" | "pnpm";
}

export interface ProjectCreationPayload {
  name: string;
  type: ProjectCreationType;
  template?: ProjectTemplate;
  blankSubtype?: BlankSubtype;
  description?: string;
  isPrivate?: boolean;
  initGit?: boolean;
  nextConfig?: NextJsConfig;
}

export type FrameworkInitType =
  | "nextjs"
  | "react-vite"
  | "nodejs"
  | "python"
  | "cpp"
  | "go"
  | "rust"
  | "html-web"
  | "add-shadcn"
  | "add-tailwind"
  | "add-eslint";

export interface FrameworkInitOptions {
  type: FrameworkInitType;
  nextConfig?: NextJsConfig;
  shadcnComponents?: string[];
  express?: boolean;
  fastapi?: boolean;
}

export interface Project {
  id: string;
  name: string;
  template: ProjectTemplate;
  description?: string;
  files: ProjectFile[];
  activeFileId: string | null;
  openFileIds: string[];
  starred?: boolean;
  isTrash?: boolean;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface EditorSettings {
  theme: "vs-dark" | "light";
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
  wordWrap: "on" | "off";
  minimap: boolean;
  autoSave: boolean;
  tabSize: number;
}

export interface ConsoleMessage {
  id: string;
  type: "log" | "error" | "warn" | "info" | "system";
  content: string;
  timestamp: number;
}

export interface AIDiffChange {
  id: string;
  fileId: string;
  filePath: string;
  originalContent: string;
  newContent: string;
  summary: string;
  status: "pending" | "accepted" | "rejected";
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  proposedDiffs?: AIDiffChange[];
}

export type SidebarView =
  | "explorer"
  | "search"
  | "git"
  | "debug"
  | "extensions"
  | "settings";

export type BottomTab = "terminal" | "output" | "problems" | "debug";

export type ShellType = "powershell" | "cmd" | "bash" | "sh";

export interface TerminalTabInfo {
  id: string;
  name: string;
  shellType: ShellType;
  cwd: string;
  isRunning?: boolean;
}

export interface AvailableShell {
  type: ShellType;
  label: string;
  path: string;
}

export interface GitFileStatus {
  fileId: string;
  path: string;
  name: string;
  status: "modified" | "added" | "deleted" | "untracked";
  staged: boolean;
}

export interface GitCommitRecord {
  id: string;
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  branch: string;
}

export interface ExtensionItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  publisher: string;
  version: string;
  downloads: string;
  rating: number;
  installed: boolean;
  enabled?: boolean;
  category: "Language" | "Themes" | "Linters" | "Formatters" | "Tools" | "Other";
  iconUrl?: string;
  license?: string;
  repository?: string;
  tags?: string[];
  settings?: Record<string, unknown>;
  requiresContainerRuntime?: boolean;
}

export interface ProjectImportFile {
  name: string;
  path: string;
  content: string;
  isFolder: boolean;
  isBinary?: boolean;
  size?: number;
  mimeType?: string;
}

export interface ProjectImportPayload {
  name: string;
  description?: string;
  isPrivate?: boolean;
  detectedTemplate?: ProjectTemplate;
  files: ProjectImportFile[];
}

export interface WorkspaceContainerConfig {
  id: string;
  projectId: string;
  status: "stopped" | "provisioning" | "running" | "error";
  image: string;
  port: number;
  previewUrl?: string;
  cpuLimit: string;
  memoryLimit: string;
  createdAt: number;
}
