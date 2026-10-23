import { ExtensionItem } from "@/types/editor";

export async function searchOpenVsxExtensions(
  query: string = "",
  category: string = ""
): Promise<{ extensions: ExtensionItem[]; source: string }> {
  try {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (category && category !== "All") params.set("category", category);

    const res = await fetch(`/api/extensions/search?${params.toString()}`);
    if (!res.ok) {
      return { extensions: [], source: "error" };
    }
    const data = await res.json();
    return {
      extensions: data.extensions || [],
      source: data.source || "open-vsx",
    };
  } catch (err) {
    console.error("searchOpenVsxExtensions error:", err);
    return { extensions: [], source: "error" };
  }
}

const INSTALLED_EXTENSIONS_KEY = "code_editor_installed_extensions_v1";

export function loadInstalledExtensionIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set(["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"]);
  }
  try {
    const raw = localStorage.getItem(INSTALLED_EXTENSIONS_KEY);
    if (!raw) {
      const defaults = ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"];
      localStorage.setItem(INSTALLED_EXTENSIONS_KEY, JSON.stringify(defaults));
      return new Set(defaults);
    }
    return new Set(JSON.parse(raw));
  } catch {
    return new Set(["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"]);
  }
}

export function saveInstalledExtensionIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INSTALLED_EXTENSIONS_KEY, JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.error("Failed to save installed extensions:", err);
  }
}

