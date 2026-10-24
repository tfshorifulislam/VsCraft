/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const packageRoot = path.dirname(require.resolve("material-icon-theme/package.json"));
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "dist", "material-icons.json"), "utf8")
);
const sourceDir = path.join(packageRoot, "icons");
const targetDir = path.resolve(__dirname, "..", "public", "material-icons");

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

const iconFiles = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
  .map((entry) => entry.name);

for (const iconFile of iconFiles) {
  fs.copyFileSync(path.join(sourceDir, iconFile), path.join(targetDir, iconFile));
}

const missingIcons = Object.entries(manifest.iconDefinitions)
  .map(([iconName, definition]) => ({
    iconName,
    iconFile: definition.iconPath.split("/").pop(),
  }))
  .filter(({ iconFile }) => !iconFile || !iconFiles.includes(iconFile));

if (missingIcons.length > 0) {
  throw new Error(
    `Material Icon Theme is missing ${missingIcons.length} mapped icon assets: ${missingIcons
      .slice(0, 5)
      .map(({ iconName }) => iconName)
      .join(", ")}`
  );
}

const license = fs.readFileSync(path.join(packageRoot, "LICENSE"), "utf8");
const attribution = [
  `${packageJson.displayName} v${packageJson.version}`,
  `Source: ${packageJson.homepage}`,
  `License: ${packageJson.license}`,
  "",
  license,
].join("\n");
fs.writeFileSync(path.join(targetDir, "LICENSE"), attribution);

console.log(
  `Synced ${iconFiles.length} ${packageJson.displayName} icons (${packageJson.version}, ${packageJson.license}).`
);
