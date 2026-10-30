export function sanitizeProjectPath(raw: string): string {
  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/\0/g, "")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "")
    .trim();

  if (
    !normalized ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("/./")
  ) {
    throw new Error("Invalid file path.");
  }

  return normalized;
}
