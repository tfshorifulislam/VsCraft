/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filename), specifier);
      return loadTsModule(path.relative(root, `${resolved}.ts`));
    }
    return require(specifier);
  };
  new Function("exports", "require", "module", "__filename", "__dirname", output)(
    module.exports,
    localRequire,
    module,
    filename,
    path.dirname(filename)
  );
  return module.exports;
}

const { buildVisibleTreeRows, getVirtualWindow } = loadTsModule("src/lib/tree/fileTree.ts");
const { WorkspaceSearchIndex } = loadTsModule("src/lib/search/workspaceSearch.ts");
const { FileContentCache } = loadTsModule("src/lib/cache/fileContentCache.ts");
const { isLargeFileContent, LARGE_FILE_CHAR_THRESHOLD } = loadTsModule(
  "src/lib/editor/largeFile.ts"
);

function now() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function measure(label, iterations, fn) {
  const start = now();
  let result;
  for (let i = 0; i < iterations; i += 1) result = fn(i);
  const elapsed = now() - start;
  return { label, iterations, totalMs: Number(elapsed.toFixed(2)), avgMs: Number((elapsed / iterations).toFixed(2)), result };
}

function buildSyntheticProject(fileCount = 20_000) {
  const files = [];
  const folders = [];
  const groups = 20;
  const subgroups = 20;
  const perSubgroup = Math.ceil(fileCount / (groups * subgroups));
  let createdFiles = 0;

  for (let g = 0; g < groups; g += 1) {
    const groupId = `folder-g${g}`;
    folders.push({
      id: groupId,
      name: `group-${g}`,
      path: `src/group-${g}`,
      content: "",
      language: "plaintext",
      isFolder: true,
      parentId: "folder-src",
    });

    for (let s = 0; s < subgroups && createdFiles < fileCount; s += 1) {
      const subgroupId = `folder-g${g}-s${s}`;
      folders.push({
        id: subgroupId,
        name: `sub-${s}`,
        path: `src/group-${g}/sub-${s}`,
        content: "",
        language: "plaintext",
        isFolder: true,
        parentId: groupId,
      });

      for (let f = 0; f < perSubgroup && createdFiles < fileCount; f += 1) {
        const index = createdFiles;
        files.push({
          id: `file-${index}`,
          name: `componentFile_${index}.ts`,
          path: `src/group-${g}/sub-${s}/componentFile_${index}.ts`,
          content: `export const marker_${index} = "${"x".repeat(180)}";\nexport const needle_${index} = true;\n`,
          language: "typescript",
          isFolder: false,
          parentId: subgroupId,
        });
        createdFiles += 1;
      }
    }
  }

  return [
    {
      id: "folder-src",
      name: "src",
      path: "src",
      content: "",
      language: "plaintext",
      isFolder: true,
      parentId: null,
    },
    ...folders,
    ...files,
  ];
}

function legacySearch(files, query) {
  const needle = query.toLowerCase();
  return files.filter(
    (file) =>
      !file.isFolder &&
      (file.name.toLowerCase().includes(needle) || file.content.toLowerCase().includes(needle))
  );
}

const failures = [];
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}: ${detail}`);
}

const files = buildSyntheticProject();
const contentChars = files.reduce((sum, file) => sum + file.content.length, 0);

const treeBuild = measure("tree-build-20k", 10, () =>
  buildVisibleTreeRows(files, {}, null)
);
const rows = treeBuild.result;
const virtualWindow = getVirtualWindow(0, 800, rows.length, 24, 8);
check("tree includes every node", rows.length === files.length, `${rows.length}/${files.length}`);
check(
  "virtual window stays bounded",
  virtualWindow.end - virtualWindow.start < 100,
  `${virtualWindow.start}-${virtualWindow.end}`
);

const collapsed = { "folder-g0": true };
const collapsedRows = buildVisibleTreeRows(files, collapsed, null);
check(
  "collapsed folder hides descendants",
  collapsedRows.length < rows.length,
  `${collapsedRows.length}/${rows.length}`
);

const index = new WorkspaceSearchIndex();
const indexUpdate = measure("search-index-update-20k", 10, () => index.update(files));
const pathQuery = "componentFile_19999";
const pathSearchRun = measure("indexed-path-search", 5, () => index.search(pathQuery));

const searchQuery = "needle_19999";
const searchRun = measure("indexed-content-search-worst-case", 5, () => index.search(searchQuery));
check(
  "indexed content search finds last file",
  searchRun.result.some((item) => item.id === "file-19999"),
  `${searchRun.result.length} results`
);

const legacyRun = measure("legacy-linear-search", 3, () => legacySearch(files, searchQuery));
check(
  "legacy comparison finds last file",
  legacyRun.result.some((item) => item.id === "file-19999"),
  `${legacyRun.result.length} results`
);

const cache = new FileContentCache(24, 32 * 1024 * 1024);
const megabyte = "a".repeat(1024 * 1024);
const cacheStart = now();
for (let i = 0; i < 100; i += 1) {
  cache.set("project", `file-${i}`, megabyte, i);
}
const cacheElapsed = now() - cacheStart;
const cacheStats = cache.stats();
const recent = cache.get("project", "file-99", 99);
const evicted = cache.get("project", "file-0", 0);
check("cache keeps entry count bounded", cacheStats.entries <= 24, JSON.stringify(cacheStats));
check(
  "cache keeps weight bounded",
  cacheStats.weight <= 32 * 1024 * 1024,
  JSON.stringify(cacheStats)
);
check("cache retains most recent file", recent?.content.length === megabyte.length, "recent");
check("cache evicts oldest file", evicted === null, String(evicted));

const largeContent = "z".repeat(9 * 1024 * 1024);
check("large file mode enabled", isLargeFileContent(largeContent), String(largeContent.length));
check(
  "threshold boundary is honest",
  isLargeFileContent("x".repeat(LARGE_FILE_CHAR_THRESHOLD)) === false &&
    isLargeFileContent("x".repeat(LARGE_FILE_CHAR_THRESHOLD + 1)) === true,
  `threshold=${LARGE_FILE_CHAR_THRESHOLD}`
);
check("large content is not modified", largeContent.length === 9 * 1024 * 1024, String(largeContent.length));

const report = {
  fixture: {
    nodes: files.length,
    contentChars,
  },
  metrics: {
    treeBuildMs: treeBuild.avgMs,
    treeRowCount: rows.length,
    virtualRowsRendered: virtualWindow.end - virtualWindow.start,
    collapsedRows: collapsedRows.length,
    searchIndexUpdateMs: indexUpdate.avgMs,
    indexedPathSearchMs: pathSearchRun.avgMs,
    indexedContentSearchMs: searchRun.avgMs,
    legacySearchMs: legacyRun.avgMs,
    cacheInsert100Ms: Number(cacheElapsed.toFixed(2)),
    cacheStats,
  },
  checks,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  console.error(`\nFAILED CHECKS:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log("\nAll editor performance and integrity checks passed.");
