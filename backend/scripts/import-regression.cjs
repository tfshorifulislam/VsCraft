const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const PROXY_BASE = process.env.BASE_URL || "http://localhost:3000";
const DIRECT_BASE = process.env.DIRECT_BASE_URL || "http://localhost:4000";
const WORKSPACES_DIR = process.env.WORKSPACES_DIR
  ? path.resolve(process.env.WORKSPACES_DIR)
  : path.resolve(__dirname, "../workspaces");

const MAX_BATCH_BODY_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_FILES = 200;
const MAX_CHUNK_CONTENT_CHARS = 1024 * 1024;
const MAX_CHUNKS_PER_FILE = 48;
const textEncoder = new TextEncoder();

const TEXT_EXTENSIONS = new Set(
  "txt md mdx rst adoc html htm xhtml css scss sass less styl js jsx mjs cjs ts tsx mts cts json jsonc json5 yaml yml toml ini cfg conf env properties xml svg csv tsv graphql gql sql py pyi rb php java kt kts scala go rs c h cc cpp cxx hpp cs swift dart lua r pl sh bash zsh fish bat cmd ps1 psm1 dockerfile makefile mk gradle groovy vue svelte astro prisma proto rego tf tfvars hcl nix lock".split(
    " "
  )
);
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
  "dockerfile",
  "makefile",
  "procfile",
  "license",
  "readme",
  "changelog",
]);
const BINARY_EXTENSIONS = new Set(
  "png jpg jpeg webp gif ico bmp avif woff woff2 ttf otf eot wasm pdf mp3 mp4 mov avi wav ogg flac zip gz tgz 7z rar exe dll so dylib class jar sqlite db".split(
    " "
  )
);

let cookie = "";
let maxRequestBytes = 0;
let userEmail = "";
const createdProjectIds = new Set();

function getExtension(filePath) {
  const name = path.basename(filePath).toLowerCase();
  return name.includes(".") ? name.split(".").pop() : "";
}

function isBinary(filePath) {
  const name = path.basename(filePath).toLowerCase();
  const extension = getExtension(filePath);
  if (TEXT_EXTENSIONS.has(extension) || TEXT_FILE_NAMES.has(name)) return false;
  if (!extension) return false;
  return BINARY_EXTENSIONS.has(extension);
}

function makeExpectedContent(filePath, buffer) {
  if (isBinary(filePath)) {
    return `data:application/octet-stream;base64,${buffer.toString("base64")}`;
  }
  const text = buffer.toString("utf8");
  if (text.includes("\0")) {
    return `data:application/octet-stream;base64,${buffer.toString("base64")}`;
  }
  return text;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function splitContent(content) {
  if (content.length === 0) return [""];
  const chunks = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + MAX_CHUNK_CONTENT_CHARS, content.length);
    if (end < content.length) {
      const lastCode = content.charCodeAt(end - 1);
      if (lastCode >= 0xd800 && lastCode <= 0xdbff) end--;
    }
    chunks.push(content.slice(start, end));
    start = end;
  }
  return chunks;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function api(method, url, body, base = PROXY_BASE) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload) {
    maxRequestBytes = Math.max(maxRequestBytes, Buffer.byteLength(payload));
  }
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: payload,
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { res, data, raw };
}

async function apiOk(method, url, body, base = PROXY_BASE) {
  const result = await api(method, url, body, base);
  if (!result.res.ok) {
    throw new Error(
      `${method} ${url} failed HTTP ${result.res.status}: ${
        typeof result.data === "string" ? result.data.slice(0, 500) : JSON.stringify(result.data)
      }`
    );
  }
  return result.data;
}

async function signup() {
  userEmail = `import-regression-${Date.now()}@example.test`;
  const res = await fetch(PROXY_BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: userEmail,
      password: "TempPass123!",
      name: "Import Regression",
    }),
  });
  if (!res.ok) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function beginImport(name) {
  const data = await apiOk("POST", "/api/projects/import/begin", { name });
  createdProjectIds.add(data.project.id);
  return data.project.id;
}

async function scanDirectory(root) {
  const files = [];
  const folders = [];
  async function visit(absDir, relDir) {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        folders.push({ name: entry.name, path: rel });
        await visit(abs, rel);
      } else if (entry.isFile()) {
        const buffer = await fsp.readFile(abs);
        files.push({
          name: entry.name,
          path: rel,
          abs,
          size: buffer.length,
          content: makeExpectedContent(rel, buffer),
          sourceSha256: sha256(buffer),
          isBinary: isBinary(rel),
        });
      }
    }
  }
  await visit(root, "");
  return { files, folders };
}

async function importTree(root, name, options = {}) {
  const selection = await scanDirectory(root);
  const projectId = await beginImport(name);

  for (let index = 0; index < selection.folders.length; index += 250) {
    const batch = selection.folders
      .slice(index, index + 250)
      .map((folder) => ({ ...folder, content: "", isFolder: true }));
    await apiOk("POST", `/api/projects/${projectId}/import/files`, { files: batch });
  }

  let batch = [];
  let batchBytes = 0;
  let sentFiles = 0;
  let chunkedFiles = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const current = batch;
    const first = sentFiles + 1;
    const last = sentFiles + current.length;
    batch = [];
    batchBytes = 0;
    const result = await apiOk("POST", `/api/projects/${projectId}/import/files`, {
      files: current,
    });
    sentFiles += result.files;
    assert(result.files === current.length, `batch ${first}-${last} file count`);
  };

  const uploadChunks = async (file, optionsForFile = {}) => {
    if (batch.length > 0) await flush();
    const chunks = splitContent(file.content);
    assert(
      chunks.length <= MAX_CHUNKS_PER_FILE,
      `${file.path} chunk count ${chunks.length} <= ${MAX_CHUNKS_PER_FILE}`
    );
    const uploadId = crypto.randomBytes(16).toString("hex");
    let completed = false;

    for (let index = 0; index < chunks.length; index++) {
      const body = {
        uploadId,
        path: file.path,
        name: file.name,
        chunk: chunks[index],
        index,
        totalChunks: chunks.length,
        totalChars: file.content.length,
        isBinary: file.isBinary,
        mimeType: file.isBinary ? "application/octet-stream" : "text/plain",
      };
      const result = await apiOk("POST", `/api/projects/${projectId}/import/chunk`, body);
      if (result.complete) completed = true;
    }

    assert(completed, `${file.path} final chunk completed`);
    if (optionsForFile.retryFinalChunk) {
      const index = chunks.length - 1;
      const retry = await apiOk("POST", `/api/projects/${projectId}/import/chunk`, {
        uploadId,
        path: file.path,
        name: file.name,
        chunk: chunks[index],
        index,
        totalChunks: chunks.length,
        totalChars: file.content.length,
        isBinary: file.isBinary,
        mimeType: file.isBinary ? "application/octet-stream" : "text/plain",
      });
      assert(retry.complete, `${file.path} repeated final chunk completed`);
    }
    chunkedFiles++;
    sentFiles++;
  };

  for (const file of selection.files) {
    const importFile = {
      name: file.name,
      path: file.path,
      content: file.content,
      isFolder: false,
      size: file.size,
      mimeType: file.isBinary ? "application/octet-stream" : "text/plain",
      isBinary: file.isBinary,
    };
    const bytes = textEncoder.encode(JSON.stringify(importFile)).length + 1;

    if (bytes + 32 > MAX_BATCH_BODY_BYTES) {
      await uploadChunks(file, options.chunkRetryPath === file.path ? { retryFinalChunk: true } : {});
      continue;
    }

    if (
      batch.length > 0 &&
      (batch.length >= MAX_BATCH_FILES || batchBytes + bytes > MAX_BATCH_BODY_BYTES)
    ) {
      await flush();
    }
    batch.push(importFile);
    batchBytes += bytes;
  }
  await flush();

  const finalized = await apiOk("POST", `/api/projects/${projectId}/import/finalize`);
  assert(finalized.project.fileCount === selection.files.length, "finalized file count");
  assert(!finalized.project.isTrash, "finalized project is not trash");

  return {
    projectId,
    selection,
    chunkedFiles,
    finalized,
    maxRequestBytes,
  };
}

async function fetchProject(projectId) {
  const data = await apiOk(
    "GET",
    `/api/projects/${projectId}?includeContent=full`,
    undefined,
    DIRECT_BASE
  );
  return data.project;
}

async function verifyProject(imported) {
  const project = await fetchProject(imported.projectId);
  const dbFiles = new Map(
    project.files.filter((file) => !file.isFolder).map((file) => [file.path, file])
  );
  const dbFolders = new Set(
    project.files.filter((file) => file.isFolder).map((file) => file.path)
  );

  assert(!project.isTrash, "project is not in trash");
  assert(dbFiles.size === imported.selection.files.length, "persisted file count");
  assert(
    dbFolders.size === imported.selection.folders.length,
    `persisted folder count ${dbFolders.size} === ${imported.selection.folders.length}`
  );
  for (const folder of imported.selection.folders) {
    assert(dbFolders.has(folder.path), `folder ${folder.path} persisted`);
  }

  for (const source of imported.selection.files) {
    const stored = dbFiles.get(source.path);
    assert(stored, `file ${source.path} persisted`);
    assert(stored.content === source.content, `content integrity for ${source.path}`);
    assert(stored.name === source.name, `name integrity for ${source.path}`);
    if (source.isBinary) {
      const base64 = stored.content.startsWith("data:")
        ? stored.content.slice(stored.content.indexOf(",") + 1)
        : Buffer.from(stored.content, "utf8").toString("base64");
      const storedSha = sha256(Buffer.from(base64, "base64"));
      assert(storedSha === source.sourceSha256, `SHA-256 integrity for ${source.path}`);
    }
  }

  if (imported.chunkedFiles > 0) {
    const stagingRoot = path.join(os.tmpdir(), "code-editor-imports", imported.projectId);
    assert(!fs.existsSync(stagingRoot), "finalize removed chunk staging");
  }

  return project;
}

async function deleteProject(projectId) {
  const result = await api("DELETE", `/api/projects/${projectId}?permanent=true`);
  if (!result.res.ok && result.res.status !== 404) {
    throw new Error(`delete ${projectId} failed: ${result.res.status} ${result.raw.slice(0, 200)}`);
  }
  assert(
    !fs.existsSync(path.join(WORKSPACES_DIR, projectId)),
    `delete removed workspace for ${projectId}`
  );
  createdProjectIds.delete(projectId);
}

async function writeFixtureFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, content);
}

async function createFrontendFixture(root) {
  await writeFixtureFile(root, "package.json", JSON.stringify({ name: "fixture-frontend" }, null, 2));
  await writeFixtureFile(root, "index.html", "<!doctype html><html><body><div id=\"root\"></div></body></html>");
  await writeFixtureFile(root, "src/main.tsx", "import { render } from './render';\nrender();\n");
  await writeFixtureFile(root, "src/render.tsx", "export function render() { return 'ok'; }\n");
  await writeFixtureFile(root, "src/components/Button.tsx", "export const Button = () => null;\n");
  await writeFixtureFile(root, ".env.local", "VITE_API_URL=http://localhost:4000\n");
  await writeFixtureFile(root, ".github/workflows/ci.yml", "name: ci\non: push\n");
  await writeFixtureFile(root, "public/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));
  await fsp.mkdir(path.join(root, "src/empty-folder"), { recursive: true });
}

async function createBackendFixture(root) {
  await writeFixtureFile(root, "package.json", JSON.stringify({ name: "fixture-backend" }, null, 2));
  await writeFixtureFile(root, "src/server.ts", "import express from 'express';\nconst app = express();\n");
  await writeFixtureFile(root, "src/routes/health.ts", "export const health = () => ({ ok: true });\n");
  await writeFixtureFile(root, "src/services/db.ts", "export const db = {};\n");
  await writeFixtureFile(root, "prisma/schema.prisma", "datasource db { provider = \"postgresql\" }\n");
  await writeFixtureFile(root, ".env", "DATABASE_URL=postgresql://example.invalid/test\n");
  await writeFixtureFile(root, "data/test.db", Buffer.concat([Buffer.from("SQLite format 3\0"), crypto.randomBytes(512)]));
  await fsp.mkdir(path.join(root, "uploads/empty"), { recursive: true });
}

async function createParentFixture(root) {
  await createFrontendFixture(path.join(root, "frontend"));
  await createBackendFixture(path.join(root, "backend"));
  await writeFixtureFile(root, "README.md", "# Full Stack Fixture\n\nfrontend + backend\n");
  await writeFixtureFile(root, ".gitignore", "node_modules\ndist\n.env\n");
}

async function createStressFixture(root) {
  for (let folder = 0; folder < 40; folder++) {
    for (let file = 0; file < 30; file++) {
      await writeFixtureFile(
        root,
        `src/module-${String(folder).padStart(2, "0")}/file-${String(file).padStart(2, "0")}.ts`,
        `export const value = "${folder}-${file}";\n`
      );
    }
  }
  await writeFixtureFile(root, ".env", "SECRET_PLACEHOLDER=not-a-real-secret\n");
  await writeFixtureFile(root, ".github/workflows/build.yml", "name: build\non: push\n");
  const mediumFile = Buffer.alloc(300 * 1024, "medium-batch-content\n");
  for (let index = 0; index < 30; index++) {
    await writeFixtureFile(root, `assets/medium/file-${index}.txt`, mediumFile);
  }
  const largeText = Buffer.from(
    Array.from({ length: 9 * 1024 * 1024 }, (_, index) => 65 + (index % 26))
  );
  await writeFixtureFile(root, "assets/large-text.txt", largeText);
  const largeBinary = crypto.randomBytes(6 * 1024 * 1024);
  await writeFixtureFile(root, "assets/large-binary.bin", largeBinary);
}

async function testFailureRecovery(fixtureRoot) {
  const projectId = await beginImport(`Recovery Test ${Date.now()}`);
  await apiOk("POST", `/api/projects/${projectId}/import/files`, {
    files: [
      { name: "src", path: "src", content: "", isFolder: true },
      { name: "keep.txt", path: "src/keep.txt", content: "first\n", isFolder: false },
    ],
  });

  const invalid = await api("POST", `/api/projects/${projectId}/import/files`, {
    files: [{ name: "escape.txt", path: "../escape.txt", content: "bad", isFolder: false }],
  });
  assert(invalid.res.status === 400, "invalid path returns 400");
  assert(invalid.data.stage === "validation", "invalid path reports validation stage");

  let project = await fetchProject(projectId);
  assert(project.isTrash, "failed import remains in trash");
  assert(
    project.files.some((file) => file.path === "src/keep.txt"),
    "earlier successful batch remains persisted"
  );

  const databaseFailure = await api("POST", `/api/projects/${projectId}/import/files`, {
    files: [{ name: "nul.txt", path: "src/nul-content.txt", content: "bad\u0000content", isFolder: false }],
  });
  assert(databaseFailure.res.status === 500, "database failure returns 500");
  assert(databaseFailure.data.stage === "database", "database failure reports database stage");
  assert(
    typeof databaseFailure.data.error === "string" &&
      databaseFailure.data.error.length > 0 &&
      !databaseFailure.data.error.includes("Prisma"),
    "database failure returns a safe message"
  );

  project = await fetchProject(projectId);
  assert(
    !project.files.some((file) => file.path === "src/nul-content.txt"),
    "failed transaction left no partial row"
  );

  await apiOk("POST", `/api/projects/${projectId}/import/files`, {
    files: [
      { name: "keep.txt", path: "src/keep.txt", content: "retried\n", isFolder: false },
      { name: "nul.txt", path: "src/nul-content.txt", content: "safe content\n", isFolder: false },
    ],
  });

  project = await fetchProject(projectId);
  const keepRows = project.files.filter((file) => file.path === "src/keep.txt");
  assert(keepRows.length === 1, "retry did not duplicate existing path");
  assert(keepRows[0].content === "retried\n", "retry replaced existing content");

  await apiOk("POST", `/api/projects/${projectId}/import/finalize`);
  const finalized = await fetchProject(projectId);
  assert(!finalized.isTrash, "recovered project finalized");
  assert(finalized.files.filter((file) => file.path === "src/nul-content.txt").length === 1, "retry persisted");
  await deleteProject(projectId);
}

async function testImportedProjectReopen(projectId) {
  const started = Date.now();
  const reopened = await apiOk("GET", `/api/projects/${projectId}`);
  const elapsed = Date.now() - started;
  assert(reopened.project.id === projectId, "imported project reopens with canonical ID");
  assert(reopened.project.files.length > 0, "reopened imported project contains files");
  assert(reopened.project.contentLazy === true, "large imported project uses lazy content");
  assert(
    reopened.project.loadedFileIds.includes(reopened.project.activeFileId),
    "active file content is included"
  );
  const unloaded = reopened.project.files.find(
    (file) =>
      !file.isFolder &&
      !file.path.endsWith(".bin") &&
      !reopened.project.loadedFileIds.includes(file.id)
  );
  assert(unloaded, "large imported project has on-demand files");
  const loaded = await apiOk(
    "GET",
    `/api/projects/${projectId}/files/${unloaded.id}/content`
  );
  assert(loaded.file.id === unloaded.id, "file content loads on demand");
  assert(loaded.file.content.length > 0, "on-demand file content is not empty");
  const workspaceContent = await fsp.readFile(
    path.join(WORKSPACES_DIR, projectId, unloaded.path),
    "utf8"
  );
  assert(
    workspaceContent === loaded.file.content,
    "lazy project open does not overwrite workspace content"
  );
  return { elapsed, files: reopened.project.files.length };
}

async function testEditorOpenSave(projectId) {
  const opened = await apiOk("GET", `/api/projects/${projectId}`);
  assert(opened.project.id === projectId, "editor opens canonical project ID");
  const file = opened.project.files.find((candidate) => !candidate.isFolder);
  assert(file, "edited project contains a file to open");

  const content = `${file.content}\n// editor save regression check`;
  const saved = await apiOk("PATCH", `/api/projects/${projectId}/files/${file.id}`, {
    content,
    version: file.version,
  });
  assert(saved.file.content === content, "editor save persists content");
  assert(saved.file.version === file.version + 1, "editor save increments version");

  const reopened = await apiOk("GET", `/api/projects/${projectId}`);
  const reopenedFile = reopened.project.files.find((candidate) => candidate.id === file.id);
  assert(reopenedFile?.content === content, "reopened project returns saved content");
  return { file: file.path, version: reopenedFile.version };
}

async function testProjectsList() {
  const started = Date.now();
  const result = await api("GET", "/api/projects?category=all");
  const elapsed = Date.now() - started;
  assert(result.res.status === 200, `project list returns 200 (got ${result.res.status})`);
  assert(Array.isArray(result.data.projects), "project list returns projects array");
  assert(Buffer.byteLength(result.raw) < 64 * 1024, "project list response stays small");
  assert(elapsed < 15_000, `project list completes promptly (${elapsed}ms)`);
  for (const project of result.data.projects) {
    for (const file of project.files || []) {
      assert(
        typeof file.content !== "string" || file.content.length <= 1200,
        `project card preview is bounded for ${project.id}/${file.path}`
      );
    }
  }
  return { count: result.data.projects.length, elapsed, bytes: Buffer.byteLength(result.raw) };
}

async function testPendingChunks() {
  const projectId = await beginImport(`Pending Chunk Test ${Date.now()}`);
  const uploadId = crypto.randomBytes(16).toString("hex");
  const content = "x".repeat(MAX_CHUNK_CONTENT_CHARS + 10);
  const chunks = splitContent(content);

  await apiOk("POST", `/api/projects/${projectId}/import/chunk`, {
    uploadId,
    path: "partial.txt",
    name: "partial.txt",
    chunk: chunks[0],
    index: 0,
    totalChunks: chunks.length,
    totalChars: content.length,
    isBinary: false,
    mimeType: "text/plain",
  });

  const finalize = await api("POST", `/api/projects/${projectId}/import/finalize`);
  assert(finalize.res.status === 409, "finalize rejects pending chunks");
  assert(finalize.data.stage === "upload", "pending chunk reports upload stage");

  await apiOk("POST", `/api/projects/${projectId}/import/abort`);
  createdProjectIds.delete(projectId);

  const stagingRoot = path.join(os.tmpdir(), "code-editor-imports", projectId);
  assert(!fs.existsSync(stagingRoot), "abort removed chunk staging");

  const deletedProjectId = await beginImport(`Pending Delete Test ${Date.now()}`);
  await apiOk("POST", `/api/projects/${deletedProjectId}/import/chunk`, {
    uploadId: crypto.randomBytes(16).toString("hex"),
    path: "pending-delete.txt",
    name: "pending-delete.txt",
    chunk: chunks[0],
    index: 0,
    totalChunks: chunks.length,
    totalChars: content.length,
    isBinary: false,
    mimeType: "text/plain",
  });
  const deletedStagingRoot = path.join(
    os.tmpdir(),
    "code-editor-imports",
    deletedProjectId
  );
  assert(fs.existsSync(deletedStagingRoot), "pending staging exists before delete");
  await deleteProject(deletedProjectId);
  assert(!fs.existsSync(deletedStagingRoot), "permanent delete removed chunk staging");
}

async function run() {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "code-editor-import-regression-"));
  const results = [];
  try {
    await signup();

    const frontendRoot = path.join(fixtureRoot, "frontend-only");
    await createFrontendFixture(frontendRoot);
    const frontendImport = await importTree(frontendRoot, "Frontend Fixture");
    await verifyProject(frontendImport);
    const editorResult = await testEditorOpenSave(frontendImport.projectId);
    await deleteProject(frontendImport.projectId);
    results.push(["frontend-only", `${frontendImport.selection.files.length} files`]);
    results.push([
      "editor open/save/reopen",
      `${editorResult.file} v${editorResult.version}`,
    ]);

    const backendRoot = path.join(fixtureRoot, "backend-only");
    await createBackendFixture(backendRoot);
    const backendImport = await importTree(backendRoot, "Backend Fixture");
    await verifyProject(backendImport);
    await deleteProject(backendImport.projectId);
    results.push(["backend-only", `${backendImport.selection.files.length} files`]);

    const parentRoot = path.join(fixtureRoot, "full-stack");
    await createParentFixture(parentRoot);
    const parentImport = await importTree(parentRoot, "Full Stack Fixture");
    let parentProject = await verifyProject(parentImport);
    assert(
      parentProject.files.some((file) => file.path === "frontend/src/main.tsx") &&
        parentProject.files.some((file) => file.path === "backend/src/server.ts"),
      "combined project preserves frontend/ and backend/ roots"
    );
    parentProject = await fetchProject(parentImport.projectId);
    await deleteProject(parentImport.projectId);
    results.push(["full-stack parent", `${parentImport.selection.files.length} files`]);

    const stressRoot = path.join(fixtureRoot, "stress");
    await createStressFixture(stressRoot);
    const stressImport = await importTree(stressRoot, "Stress Fixture", {
      chunkRetryPath: "assets/large-binary.bin",
    });
    const stressProject = await verifyProject(stressImport);
    assert(stressImport.chunkedFiles === 2, "large text and binary used chunk upload");
    assert(
      stressProject.files.some((file) => file.path === "assets/large-text.txt"),
      "large text persisted"
    );
    assert(
      stressProject.files.some((file) => file.path === "assets/large-binary.bin"),
      "large binary persisted"
    );
    assert(
      stressProject.files.filter((file) => file.path === "assets/large-binary.bin").length === 1,
      "retried chunk upload did not duplicate file"
    );
    const listResult = await testProjectsList();
    const reopenResult = await testImportedProjectReopen(stressImport.projectId);
    await deleteProject(stressImport.projectId);
    results.push([
      "stress",
      `${stressImport.selection.files.length} files, ${stressImport.chunkedFiles} chunked`,
    ]);
    results.push([
      "imported project reopen",
      `${reopenResult.files} files in ${reopenResult.elapsed}ms`,
    ]);
    results.push([
      "projects dashboard list",
      `${listResult.count} projects, ${listResult.bytes} bytes, ${listResult.elapsed}ms`,
    ]);

    await testFailureRecovery(fixtureRoot);
    results.push(["failure recovery/retry", "validation + database failure recovered"]);

    await testPendingChunks();
    results.push(["pending chunk protection", "409 + staging cleanup"]);

    assert(maxRequestBytes <= MAX_BATCH_BODY_BYTES + 2 * 1024 * 1024, "request bodies stayed bounded");

    console.log("Import regression tests passed:");
    for (const [name, detail] of results) console.log(`  - ${name}: ${detail}`);
    console.log(`  - max JSON request body: ${(maxRequestBytes / (1024 * 1024)).toFixed(2)} MB`);
  } finally {
    for (const projectId of [...createdProjectIds]) {
      try {
        await deleteProject(projectId);
      } catch (error) {
        console.warn(
          `Cleanup could not delete project ${projectId}:`,
          error instanceof Error ? error.message : error
        );
      }
      await fsp
        .rm(path.join(WORKSPACES_DIR, projectId), { recursive: true, force: true })
        .catch(() => undefined);
    }
    await fsp.rm(fixtureRoot, { recursive: true, force: true }).catch(() => undefined);

    if (userEmail) {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      try {
        await prisma.user.delete({ where: { email: userEmail } }).catch(() => undefined);
      } finally {
        await prisma.$disconnect();
      }
    }
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

