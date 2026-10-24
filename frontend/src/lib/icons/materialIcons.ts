import manifestSource from "material-icon-theme/dist/material-icons.json";

interface IconDefinition {
  iconPath: string;
}

interface MaterialIconManifest {
  iconDefinitions: Record<string, IconDefinition>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  file: string;
  folder: string;
  folderExpanded: string;
}

export interface ResolvedFileIcon {
  iconName: string;
  src: string;
}

const manifest = manifestSource as unknown as MaterialIconManifest;
const ICON_BASE_PATH = "/material-icons";

function normalize(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/^\/+/, "").toLowerCase();
}

function normalizeMap(source: Record<string, string>): Map<string, string> {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = normalize(key);
    if (!normalized.has(normalizedKey)) normalized.set(normalizedKey, value);
  }
  return normalized;
}

const iconSources = new Map<string, string>();
for (const [iconName, definition] of Object.entries(manifest.iconDefinitions)) {
  const iconFile = definition.iconPath.split("/").pop();
  if (iconFile) iconSources.set(iconName, `${ICON_BASE_PATH}/${iconFile}`);
}

const fileNameIcons = normalizeMap(manifest.fileNames);
const fileExtensionIcons = normalizeMap(manifest.fileExtensions);
const folderNameIcons = normalizeMap(manifest.folderNames);
const folderNameExpandedIcons = normalizeMap(manifest.folderNamesExpanded);

function getPathCandidates(path: string, fallbackName: string): string[] {
  const normalizedPath = normalize(path || fallbackName);
  if (!normalizedPath) return [];

  const candidates = [normalizedPath];
  let slashIndex = normalizedPath.indexOf("/");
  while (slashIndex !== -1) {
    const suffix = normalizedPath.slice(slashIndex + 1);
    if (suffix) candidates.push(suffix);
    slashIndex = normalizedPath.indexOf("/", slashIndex + 1);
  }
  return candidates;
}

function getExtensionCandidates(fileName: string): string[] {
  const candidates: string[] = [];
  let dotIndex = fileName.indexOf(".");
  while (dotIndex !== -1) {
    const extension = fileName.slice(dotIndex + 1);
    if (extension) candidates.push(extension);
    dotIndex = fileName.indexOf(".", dotIndex + 1);
  }
  return candidates;
}

function findIcon(source: Map<string, string>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const iconName = source.get(candidate);
    if (iconName) return iconName;
  }
  return undefined;
}

function resolveFileName(name: string, path: string): string {
  const normalizedName = normalize(name || path);
  const baseName = normalizedName.split("/").pop() || normalizedName;
  const exactIcon = findIcon(fileNameIcons, getPathCandidates(path, baseName));
  if (exactIcon) return exactIcon;

  for (const extension of getExtensionCandidates(baseName)) {
    const extensionIcon = fileExtensionIcons.get(extension);
    if (extensionIcon) return extensionIcon;
  }

  return manifest.file;
}

function resolveFolderName(name: string, path: string, isExpanded: boolean): string {
  const candidates = getPathCandidates(path, name);
  const folderIcon = findIcon(
    isExpanded ? folderNameExpandedIcons : folderNameIcons,
    candidates
  );
  if (folderIcon) return folderIcon;
  if (isExpanded) {
    const collapsedIcon = findIcon(folderNameIcons, candidates);
    if (collapsedIcon) return collapsedIcon;
  }
  return isExpanded ? manifest.folderExpanded : manifest.folder;
}

function getIconSource(iconName: string): string {
  return (
    iconSources.get(iconName) ??
    iconSources.get(manifest.file) ??
    `${ICON_BASE_PATH}/file.svg`
  );
}

export function resolveFileIcon(
  name: string,
  path = "",
  isFolder = false,
  isExpanded = false
): ResolvedFileIcon {
  const iconName = isFolder
    ? resolveFolderName(name, path, isExpanded)
    : resolveFileName(name, path);

  return {
    iconName,
    src: getIconSource(iconName),
  };
}
