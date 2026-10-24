/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const packageRoot = path.dirname(require.resolve("material-icon-theme/package.json"));
const packageJson = require(path.join(packageRoot, "package.json"));
const manifest = require(path.join(packageRoot, "dist", "material-icons.json"));
const publicIconDir = path.join(root, "public", "material-icons");

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
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

const { resolveFileIcon } = loadTsModule("src/lib/icons/materialIcons.ts");

const failures = [];
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}: ${detail}`);
}

function checkFileIcon(name, filePath, expectedIcon) {
  const result = resolveFileIcon(name, filePath, false, false);
  check(
    `file:${name}`,
    result.iconName === expectedIcon,
    `expected ${expectedIcon}, got ${result.iconName}`
  );
  check(
    `asset:${name}`,
    result.src.startsWith("/material-icons/") &&
      fs.existsSync(path.join(publicIconDir, path.basename(result.src))),
    `missing ${result.src}`
  );
}

function checkFolderIcon(name, folderPath, isExpanded, expectedIcon) {
  const result = resolveFileIcon(name, folderPath, true, isExpanded);
  check(
    `folder:${name}:${isExpanded ? "open" : "closed"}`,
    result.iconName === expectedIcon,
    `expected ${expectedIcon}, got ${result.iconName}`
  );
  check(
    `folder-asset:${name}`,
    result.src.startsWith("/material-icons/") &&
      fs.existsSync(path.join(publicIconDir, path.basename(result.src))),
    `missing ${result.src}`
  );
}

checkFileIcon("package.json", "package.json", "nodejs");
checkFileIcon("README.md", "README.md", "readme");
checkFileIcon("PACKAGE.JSON", "PACKAGE.JSON", "nodejs");
checkFileIcon("App.tsx", "src/App.tsx", "react_ts");
checkFileIcon("index.d.ts", "types/index.d.ts", "typescript-def");
checkFileIcon("route.ts", "app/route.ts", "routing");
checkFileIcon("FUNDING.yml", ".github/FUNDING.yml", "github-sponsors");
checkFileIcon("Dockerfile", "Dockerfile", "docker");
checkFileIcon(".gitignore", ".gitignore", "git");
checkFileIcon("next.config.ts", "next.config.ts", "next");
checkFileIcon("vite.config.ts", "vite.config.ts", "vite");
checkFileIcon("schema.prisma", "prisma/schema.prisma", "prisma");
checkFileIcon("main.go", "cmd/main.go", "go");
checkFileIcon("lib.rs", "src/lib.rs", "rust");
checkFileIcon("globals.css", "app/globals.css", "css");
checkFileIcon("logo.png", "public/logo.png", "image");
checkFileIcon("unknown.xyz", "unknown.xyz", "file");
checkFileIcon("no-extension", "scripts/no-extension", "file");

checkFolderIcon("src", "src", false, "folder-src");
checkFolderIcon("src", "src", true, "folder-src-open");
checkFolderIcon("components", "src/components", false, "folder-components");
checkFolderIcon("components", "src/components", true, "folder-components-open");
checkFolderIcon("ISSUE_TEMPLATE", ".github/ISSUE_TEMPLATE", false, "folder-template");
checkFolderIcon("ISSUE_TEMPLATE", "project/.github/ISSUE_TEMPLATE", true, "folder-template-open");
checkFolderIcon("node_modules", "node_modules", false, "folder-node");
checkFolderIcon("random-folder", "src/random-folder", false, "folder");
checkFolderIcon("random-folder", "src/random-folder", true, "folder-open");

const iconDefinitions = Object.entries(manifest.iconDefinitions);
const missingAssets = iconDefinitions
  .map(([iconName, definition]) => ({
    iconName,
    iconFile: definition.iconPath.split("/").pop(),
  }))
  .filter(({ iconFile }) => !iconFile || !fs.existsSync(path.join(publicIconDir, iconFile)));
check(
  "all mapped assets exist",
  missingAssets.length === 0,
  `${missingAssets.length} missing: ${missingAssets
    .slice(0, 5)
    .map(({ iconName }) => iconName)
    .join(", ")}`
);

const publicIcons = fs
  .readdirSync(publicIconDir)
  .filter((file) => file.endsWith(".svg"));
check(
  "complete asset set",
  publicIcons.length === iconDefinitions.length,
  `${publicIcons.length} assets for ${iconDefinitions.length} definitions`
);

const licensePath = path.join(publicIconDir, "LICENSE");
check("license present", fs.existsSync(licensePath), `missing ${licensePath}`);
if (fs.existsSync(licensePath)) {
  const license = fs.readFileSync(licensePath, "utf8");
  check("license is MIT", license.includes("MIT License"), "MIT license text missing");
  check(
    "license version",
    license.includes(`v${packageJson.version}`),
    `version ${packageJson.version} missing`
  );
}

console.log(
  `${packageJson.displayName} v${packageJson.version} (${packageJson.license}): ` +
    `${Object.keys(manifest.fileNames).length} filenames, ` +
    `${Object.keys(manifest.fileExtensions).length} extensions, ` +
    `${Object.keys(manifest.folderNames).length} folders, ` +
    `${iconDefinitions.length} icons`
);

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.pass ? "" : ` - ${result.detail}`}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} icon checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} icon checks passed.`);
