import { Router, Request, Response } from "express";
import { ExtensionItem } from "../types/editor";

const router = Router();

const CURATED_EXTENSIONS: ExtensionItem[] = [
  {
    id: "esbenp.prettier-vscode",
    name: "prettier-vscode",
    displayName: "Prettier - Code Formatter",
    description: "Code formatter using prettier for JS, TS, HTML, CSS, JSON, Markdown.",
    publisher: "esbenp",
    version: "10.1.0",
    downloads: "45.2M",
    rating: 4.8,
    installed: true,
    enabled: true,
    category: "Formatters",
    license: "MIT",
    repository: "https://github.com/prettier/prettier-vscode",
    requiresContainerRuntime: false,
    tags: ["formatter", "prettier", "javascript", "typescript"],
  },
  {
    id: "dbaeumer.vscode-eslint",
    name: "vscode-eslint",
    displayName: "ESLint",
    description: "Integrates ESLint JavaScript into VS Code with live diagnostics and fix on save.",
    publisher: "dbaeumer",
    version: "3.0.8",
    downloads: "36.5M",
    rating: 4.7,
    installed: true,
    enabled: true,
    category: "Linters",
    license: "MIT",
    repository: "https://github.com/microsoft/vscode-eslint",
    requiresContainerRuntime: false,
    tags: ["lint", "eslint", "javascript", "react"],
  },
  {
    id: "bradlc.vscode-tailwindcss",
    name: "vscode-tailwindcss",
    displayName: "Tailwind CSS IntelliSense",
    description: "Intelligent Tailwind CSS tooling with autocomplete, syntax highlighting, and linting.",
    publisher: "bradlc",
    version: "0.10.5",
    downloads: "19.8M",
    rating: 4.9,
    installed: false,
    enabled: false,
    category: "Tools",
    license: "MIT",
    repository: "https://github.com/tailwindlabs/tailwindcss-intellisense",
    requiresContainerRuntime: false,
    tags: ["tailwind", "css", "autocomplete"],
  },
  {
    id: "ms-python.python",
    name: "python",
    displayName: "Python",
    description: "IntelliSense (Pylance), Linting, Debugging (debugpy), Code formatting for Python 3.",
    publisher: "ms-python",
    version: "2024.4.1",
    downloads: "135M",
    rating: 4.8,
    installed: true,
    enabled: true,
    category: "Language",
    license: "MIT",
    repository: "https://github.com/microsoft/vscode-python",
    requiresContainerRuntime: true,
    tags: ["python", "intellisense", "debugging"],
  },
  {
    id: "rust-lang.rust-analyzer",
    name: "rust-analyzer",
    displayName: "rust-analyzer",
    description: "Rust language support with full completion, diagnostics, and semantic refactoring.",
    publisher: "rust-lang",
    version: "0.4.1912",
    downloads: "9.2M",
    rating: 4.9,
    installed: false,
    enabled: false,
    category: "Language",
    license: "Apache-2.0",
    repository: "https://github.com/rust-lang/rust-analyzer",
    requiresContainerRuntime: true,
    tags: ["rust", "rust-analyzer", "cargo"],
  },
  {
    id: "golang.go",
    name: "go",
    displayName: "Go",
    description: "Rich language support for the Go programming language (gopls, debugging).",
    publisher: "golang",
    version: "0.41.2",
    downloads: "15.4M",
    rating: 4.8,
    installed: false,
    enabled: false,
    category: "Language",
    license: "MIT",
    repository: "https://github.com/golang/vscode-go",
    requiresContainerRuntime: true,
    tags: ["go", "golang", "gopls"],
  },
  {
    id: "tamasfe.even-better-toml",
    name: "even-better-toml",
    displayName: "Even Better TOML",
    description: "Fully-featured TOML support with syntax highlighting, schema validation, and formatting.",
    publisher: "tamasfe",
    version: "0.19.2",
    downloads: "5.1M",
    rating: 4.9,
    installed: false,
    enabled: false,
    category: "Tools",
    license: "MIT",
    repository: "https://github.com/tamasfe/even-better-toml",
    requiresContainerRuntime: false,
    tags: ["toml", "cargo", "config"],
  },
  {
    id: "dracula-theme.theme-dracula",
    name: "theme-dracula",
    displayName: "Dracula Official Theme",
    description: "Famous dark theme for Visual Studio Code and 200+ apps.",
    publisher: "dracula-theme",
    version: "2.24.3",
    downloads: "7.8M",
    rating: 4.9,
    installed: false,
    enabled: false,
    category: "Themes",
    license: "MIT",
    repository: "https://github.com/dracula/visual-studio-code",
    requiresContainerRuntime: false,
    tags: ["theme", "dracula", "dark"],
  },
  {
    id: "pkief.material-icon-theme",
    name: "material-icon-theme",
    displayName: "Material Icon Theme",
    description: "Material Design Icons for Visual Studio Code.",
    publisher: "pkief",
    version: "4.34.0",
    downloads: "24.1M",
    rating: 4.9,
    installed: false,
    enabled: false,
    category: "Themes",
    license: "MIT",
    repository: "https://github.com/PKief/vscode-material-icon-theme",
    requiresContainerRuntime: false,
    tags: ["icons", "material", "theme"],
  },
  {
    id: "redhat.vscode-yaml",
    name: "vscode-yaml",
    displayName: "YAML Language Support",
    description: "YAML Language Support by Red Hat, with built-in Kubernetes and JSON schema validation.",
    publisher: "redhat",
    version: "1.14.0",
    downloads: "32.0M",
    rating: 4.6,
    installed: false,
    enabled: false,
    category: "Language",
    license: "MIT",
    repository: "https://github.com/redhat-developer/vscode-yaml",
    requiresContainerRuntime: false,
    tags: ["yaml", "kubernetes", "schema"],
  },
];

function formatDownloads(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

function mapCategory(categories?: string[]): ExtensionItem["category"] {
  if (!categories || categories.length === 0) return "Other";
  const cat = categories.join(" ").toLowerCase();
  if (cat.includes("theme")) return "Themes";
  if (cat.includes("formatter")) return "Formatters";
  if (cat.includes("linter")) return "Linters";
  if (cat.includes("language") || cat.includes("programming")) return "Language";
  return "Tools";
}

// GET /api/extensions/search
router.get("/search", async (req: Request, res: Response) => {
  const query = (req.query.query as string)?.trim() || "";
  const category = (req.query.category as string)?.trim() || "";

  if (!query && !category) {
    return res.json({
      extensions: CURATED_EXTENSIONS,
      source: "curated",
      total: CURATED_EXTENSIONS.length,
    });
  }

  try {
    const openVsxUrl = new URL("https://open-vsx.org/api/-/search");
    if (query) openVsxUrl.searchParams.set("query", query);
    if (category && category !== "All") openVsxUrl.searchParams.set("category", category);
    openVsxUrl.searchParams.set("size", "24");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const apiRes = await fetch(openVsxUrl.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeoutId);

    if (apiRes.ok) {
      const data: any = await apiRes.json();
      const rawExtensions: any[] = data.extensions || [];

      const mapped: ExtensionItem[] = rawExtensions.map((item: any) => {
        const id = `${item.namespace}.${item.name}`;
        const requiresContainer =
          item.categories?.some((c: string) =>
            ["Debuggers", "Programming Languages"].includes(c)
          ) || ["python", "rust-analyzer", "cpptools", "go"].includes(item.name);

        return {
          id,
          name: item.name,
          displayName: item.displayName || item.name,
          description: item.description || "No description provided.",
          publisher: item.namespace,
          version: item.version,
          downloads: formatDownloads(item.downloadCount || 0),
          rating: item.averageRating ? Math.round(item.averageRating * 10) / 10 : 4.5,
          installed: false,
          enabled: false,
          category: mapCategory(item.categories),
          iconUrl: item.files?.icon,
          license: item.license || "Open Source",
          repository: item.repository || item.homepage,
          requiresContainerRuntime: requiresContainer,
          tags: item.categories || [],
        };
      });

      if (mapped.length > 0) {
        return res.json({
          extensions: mapped,
          source: "open-vsx",
          total: data.totalSize || mapped.length,
        });
      }
    }
  } catch (err) {
    console.warn("Open VSX live API query failed or timed out. Falling back to curated:", err);
  }

  const q = query.toLowerCase();
  const filtered = CURATED_EXTENSIONS.filter((ext) => {
    const matchesQuery =
      !q ||
      ext.name.toLowerCase().includes(q) ||
      ext.displayName.toLowerCase().includes(q) ||
      ext.description.toLowerCase().includes(q) ||
      ext.publisher.toLowerCase().includes(q) ||
      (ext.tags && ext.tags.some((t) => t.toLowerCase().includes(q)));

    const matchesCategory =
      !category || category === "All" || ext.category.toLowerCase() === category.toLowerCase();

    return matchesQuery && matchesCategory;
  });

  return res.json({
    extensions: filtered,
    source: "curated-fallback",
    total: filtered.length,
  });
});

export default router;
