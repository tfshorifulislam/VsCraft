/**
 * Centralized environment sanitizer for project workspaces, dev servers, and terminal shells.
 * Ensures that sensitive host environment variables (DATABASE_URL, JWT_SECRET, AI provider keys)
 * are NEVER leaked to user terminals, spawned child processes, or workspace dev servers.
 */

const EXPLICIT_SENSITIVE_KEYS = new Set([
  "DATABASE_URL",
  "JWT_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_WORKSPACE_ID",
  "GITHUB_TOKEN",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "VERCEL_TOKEN",
  "RAILWAY_TOKEN",
  "PRISMA_DATABASE_URL",
]);

export function getSanitizedWorkspaceEnv(
  projectId: string,
  workspaceRoot: string,
  extraEnv: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
  };

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;

    // Check explicit blocklist
    if (EXPLICIT_SENSITIVE_KEYS.has(key)) continue;

    // Pattern matching for sensitive naming
    const upperKey = key.toUpperCase();
    if (
      upperKey.includes("SECRET") ||
      upperKey.includes("API_KEY") ||
      upperKey.includes("PASSWORD") ||
      upperKey.includes("TOKEN") ||
      upperKey.includes("PRIVATE_KEY")
    ) {
      continue;
    }

    safeEnv[key] = value;
  }

  return {
    ...safeEnv,
    PROJECT_ID: projectId,
    WORKSPACE_ROOT: workspaceRoot,
    NODE_ENV: "development",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    FORCE_COLOR: "1",
    ...extraEnv,
  };
}
