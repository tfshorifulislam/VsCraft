import { EditorSettings, Project } from "@/types/editor";

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: "vs-dark",
  fontSize: 14,
  fontFamily: '"Consolas", "Courier New", monospace',
  lineHeight: 1.5,
  wordWrap: "on",
  minimap: true,
  autoSave: true,
  tabSize: 2,
};

const STORAGE_KEY_SETTINGS = "code_editor_settings_v2";

export function loadEditorSettings(): EditorSettings {
  if (typeof window === "undefined") return DEFAULT_EDITOR_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_EDITOR_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_EDITOR_SETTINGS,
      ...parsed,
      fontSize: typeof parsed.fontSize === "number" && parsed.fontSize > 0 ? parsed.fontSize : 14,
      fontFamily: parsed.fontFamily || DEFAULT_EDITOR_SETTINGS.fontFamily,
      lineHeight: typeof parsed.lineHeight === "number" && parsed.lineHeight > 0 ? parsed.lineHeight : 1.5,
    };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

export function saveEditorSettings(settings: EditorSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save settings", err);
  }
}

export function exportProjectAsJSON(project: Project): void {
  if (typeof window === "undefined") return;
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(project, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute(
    "download",
    `${project.name.toLowerCase().replace(/\s+/g, "-")}.json`
  );
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
