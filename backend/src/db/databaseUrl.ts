const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return undefined;

  const value = trimmed.startsWith("postgres://")
    ? `postgresql://${trimmed.slice("postgres://".length)}`
    : trimmed;

  try {
    const url = new URL(value);
    if (!LOCAL_HOSTS.has(url.hostname) && !url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    return url.toString();
  } catch {
    return value;
  }
}
