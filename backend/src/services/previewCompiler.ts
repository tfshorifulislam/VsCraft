import * as esbuild from "esbuild";
import path from "path";

export interface ProjectPreviewInput {
  id: string;
  name: string;
  template: string;
  files: Array<{
    id?: string;
    name: string;
    path: string;
    content: string;
    isFolder: boolean;
    language?: string;
  }>;
}

export interface CompilationResult {
  success: boolean;
  html: string;
  error?: {
    message: string;
    file?: string;
    line?: number;
    column?: number;
    lineText?: string;
  };
}

function getConsoleBridgeScript(): string {
  return `
    <script>
      (function() {
        const sendMsg = (type, args) => {
          try {
            const formatted = Array.from(args).map(arg => {
              if (typeof arg === "object" && arg !== null) {
                try { return JSON.stringify(arg, null, 2); } catch(e) { return String(arg); }
              }
              return String(arg);
            }).join(" ");
            window.parent.postMessage({ type: "PREVIEW_CONSOLE", level: type, text: formatted, timestamp: Date.now() }, "*");
          } catch(e) {}
        };

        const origLog = console.log;
        const origError = console.error;
        const origWarn = console.warn;
        const origInfo = console.info;

        console.log = function(...args) { sendMsg("log", args); origLog.apply(console, args); };
        console.error = function(...args) { sendMsg("error", args); origError.apply(console, args); };
        console.warn = function(...args) { sendMsg("warn", args); origWarn.apply(console, args); };
        console.info = function(...args) { sendMsg("info", args); origInfo.apply(console, args); };

        window.addEventListener("error", function(e) {
          sendMsg("error", [e.message + " (" + (e.filename || "app") + ":" + (e.lineno || 1) + ")"]);
        });

        window.addEventListener("unhandledrejection", function(e) {
          sendMsg("error", ["Unhandled Promise Rejection: " + (e.reason ? e.reason.message || e.reason : "Unknown error")]);
        });
      })();
    </script>
  `;
}

function renderErrorOverlay(error: {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  lineText?: string;
}): string {
  const bridge = getConsoleBridgeScript();
  const fileInfo = error.file ? `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}` : "Source Code";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Compilation Error</title>
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: #111113;
            color: #f4f4f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            box-sizing: border-box;
          }
          .card {
            background: #1c1c1f;
            border: 1px solid #ef4444;
            border-radius: 12px;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          }
          .badge {
            display: inline-block;
            background: #dc2626;
            color: #fff;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
          }
          h2 {
            margin: 0 0 8px 0;
            font-size: 16px;
            color: #fca5a5;
            font-family: monospace;
          }
          .file {
            font-size: 12px;
            color: #a1a1aa;
            margin-bottom: 16px;
            font-family: monospace;
          }
          .code-box {
            background: #09090b;
            border: 1px solid #27272a;
            border-radius: 8px;
            padding: 14px;
            overflow-x: auto;
            font-family: "Consolas", "Courier New", monospace;
            font-size: 13px;
            color: #f43f5e;
            white-space: pre-wrap;
          }
          .footer {
            margin-top: 16px;
            font-size: 12px;
            color: #71717a;
          }
        </style>
        ${bridge}
      </head>
      <body>
        <div class="card">
          <span class="badge">Build Error</span>
          <h2>${escapeHtml(error.message)}</h2>
          <div class="file">in ${escapeHtml(fileInfo)}</div>
          ${
            error.lineText
              ? `<div class="code-box">${error.line ? `${error.line} | ` : ""}${escapeHtml(error.lineText)}\n${error.column ? " ".repeat(Math.max(0, (error.line ? String(error.line).length + 3 : 0) + error.column - 1)) + "^" : ""}</div>`
              : ""
          }
          <div class="footer">
            Fix the syntax or import in the editor and press <strong>Ctrl + S</strong>. The live preview will reload automatically.
          </div>
        </div>
      </body>
    </html>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Builds an in-memory virtual filesystem map from the project's files.
 */
function createProjectFileMap(files: ProjectPreviewInput["files"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of files) {
    if (!f.isFolder) {
      const cleanPath = f.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
      map.set(cleanPath, f.content ?? "");
      map.set(`./${cleanPath}`, f.content ?? "");
      if (cleanPath.startsWith("src/")) {
        map.set(cleanPath.replace(/^src\//, ""), f.content ?? "");
        map.set(`./${cleanPath.replace(/^src\//, "")}`, f.content ?? "");
      }
      map.set(f.name, f.content ?? "");
    }
  }
  return map;
}

/**
 * Compiles and bundles any React or Next.js App Router project into real, executing ES modules.
 */
export async function compileReactOrNextProject(project: ProjectPreviewInput): Promise<CompilationResult> {
  const fileMap = createProjectFileMap(project.files);

  // 1. Determine entry file
  const isNextApp = project.template === "next-app" || fileMap.has("src/app/page.tsx") || fileMap.has("app/page.tsx");

  let entryPath = "";
  if (isNextApp) {
    entryPath = fileMap.has("src/app/page.tsx") ? "src/app/page.tsx" : "app/page.tsx";
  } else {
    // React TS/JS
    const candidates = [
      "src/App.tsx",
      "src/App.jsx",
      "src/main.tsx",
      "src/index.tsx",
      "App.tsx",
      "App.jsx",
    ];
    for (const c of candidates) {
      if (fileMap.has(c)) {
        entryPath = c;
        break;
      }
    }
    if (!entryPath) {
      // Find any tsx or jsx
      const anyTsx = project.files.find((f) => !f.isFolder && (f.name.endsWith(".tsx") || f.name.endsWith(".jsx")));
      if (anyTsx) entryPath = anyTsx.path.replace(/^\/+/, "");
    }
  }

  if (!entryPath || !fileMap.has(entryPath)) {
    return {
      success: false,
      html: renderErrorOverlay({
        message: isNextApp
          ? "No 'src/app/page.tsx' found in project."
          : "No 'src/App.tsx' entry component found in project.",
        file: isNextApp ? "src/app/page.tsx" : "src/App.tsx",
      }),
      error: {
        message: "Entry file not found.",
        file: entryPath,
      },
    };
  }

  // 2. Extract CSS files
  const cssFiles = project.files.filter((f) => !f.isFolder && f.name.endsWith(".css"));
  const cssContent = cssFiles.map((f) => f.content).join("\n\n");

  // 3. Setup esbuild virtual bundle plugin
  const virtualFsPlugin: esbuild.Plugin = {
    name: "project-vfs",
    setup(build) {
      // Intercept and resolve imports
      build.onResolve({ filter: /.*/ }, (args) => {
        // Externalize third-party npm libraries to be resolved via browser importmap
        const externalLibs = [
          "react",
          "react-dom",
          "react-dom/client",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "lucide-react",
          "clsx",
          "tailwind-merge",
        ];

        if (externalLibs.includes(args.path)) {
          return { path: args.path, external: true };
        }

        if (args.kind === "entry-point") {
          const cleanEntry = args.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
          return { path: cleanEntry, namespace: "vfs" };
        }

        // Relative path or alias resolution
        let clean = args.path.replace(/\\/g, "/");

        // Handle @/ alias (standard Next.js / Vite alias)
        if (clean.startsWith("@/")) {
          clean = clean.replace(/^@\//, "");
        } else if (clean.startsWith("./") || clean.startsWith("../")) {
          const importerDir = path.dirname(args.importer).replace(/\\/g, "/");
          clean = path.posix.normalize(path.posix.join(importerDir === "." ? "" : importerDir, clean));
        }

        // Try exact match, then with extensions
        const extensions = ["", ".tsx", ".ts", ".jsx", ".js", ".json", "/index.tsx", "/index.ts"];
        for (const ext of extensions) {
          const candidate = `${clean}${ext}`;
          if (fileMap.has(candidate)) {
            return { path: candidate, namespace: "vfs" };
          }
          // Try with src/ prefix if not present
          if (!candidate.startsWith("src/")) {
            const withSrc = `src/${candidate}`;
            if (fileMap.has(withSrc)) {
              return { path: withSrc, namespace: "vfs" };
            }
          }
        }

        // If it's a CSS file import, treat as empty module since CSS is bundled globally
        if (clean.endsWith(".css")) {
          return { path: clean, namespace: "vfs-css" };
        }

        // Fallback: external
        return { path: args.path, external: true };
      });

      // Load contents
      build.onLoad({ filter: /.*/, namespace: "vfs" }, (args) => {
        const clean = args.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
        const content =
          fileMap.get(clean) ??
          fileMap.get(`src/${clean}`) ??
          fileMap.get(clean.replace(/^src\//, "")) ??
          fileMap.get(path.basename(clean));

        if (content === undefined) {
          return {
            errors: [
              {
                text: `Module not found: Can't resolve '${args.path}' in workspace`,
              },
            ],
          };
        }

        const ext = clean.split(".").pop()?.toLowerCase() || "";
        let loader: esbuild.Loader = "tsx";
        if (ext === "json") loader = "json";
        else if (ext === "css") loader = "css";
        else if (ext === "js" || ext === "jsx") loader = "jsx";
        else if (ext === "ts") loader = "ts";

        return { contents: content, loader };
      });

      build.onLoad({ filter: /.*/, namespace: "vfs-css" }, () => {
        return { contents: "", loader: "js" };
      });
    },
  };

  // 4. Run esbuild bundle
  let bundledJs = "";
  try {
    const buildResult = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: "esm",
      jsx: "automatic",
      target: "es2022",
      plugins: [virtualFsPlugin],
      write: false,
    });

    bundledJs = buildResult.outputFiles?.[0]?.text || "";
  } catch (err: unknown) {
    // Real compiler error from esbuild!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const esbuildErr = err as any;
    const firstError = esbuildErr.errors?.[0];

    const errObj = {
      message: firstError?.text || (err instanceof Error ? err.message : "Syntax or compilation error"),
      file: firstError?.location?.file || entryPath,
      line: firstError?.location?.line,
      column: firstError?.location?.column,
      lineText: firstError?.location?.lineText,
    };

    return {
      success: false,
      html: renderErrorOverlay(errObj),
      error: errObj,
    };
  }

  // 5. Generate interactive HTML runtime container
  const bridge = getConsoleBridgeScript();

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(project.name)} — Preview</title>
        
        <!-- Tailwind CSS v3/v4 standalone CDN for instant utility classes -->
        <script src="https://cdn.tailwindcss.com"></script>
        
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
            background-color: #ffffff;
            color: #171717;
          }
          ${cssContent}
        </style>

        <!-- Import map for React 19 and common IDE modules -->
        <script type="importmap">
          {
            "imports": {
              "react": "https://esm.sh/react@19.0.0",
              "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
              "react/jsx-dev-runtime": "https://esm.sh/react@19.0.0/jsx-dev-runtime",
              "react-dom": "https://esm.sh/react-dom@19.0.0",
              "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
              "lucide-react": "https://esm.sh/lucide-react@0.475.0?external=react"
            }
          }
        </script>

        ${bridge}
      </head>
      <body>
        <div id="root"></div>

        <script type="module">
          import React, { Component } from "react";
          import { createRoot } from "react-dom/client";

          // Real React Error Boundary to catch runtime errors in user code
          class ErrorBoundary extends Component {
            constructor(props) {
              super(props);
              this.state = { hasError: false, error: null };
            }
            static getDerivedStateFromError(error) {
              return { hasError: true, error };
            }
            componentDidCatch(error, errorInfo) {
              console.error("Runtime Error in Component:", error.message, errorInfo);
            }
            render() {
              if (this.state.hasError) {
                return React.createElement(
                  "div",
                  {
                    style: {
                      padding: "24px",
                      margin: "20px",
                      background: "#fff1f2",
                      border: "1px solid #f43f5e",
                      borderRadius: "12px",
                      fontFamily: "monospace",
                      color: "#9f1239"
                    }
                  },
                  React.createElement("strong", { style: { fontSize: "16px" } }, "Application Runtime Error"),
                  React.createElement("pre", { style: { marginTop: "12px", whiteSpace: "pre-wrap" } }, String(this.state.error?.message || this.state.error))
                );
              }
              return this.props.children;
            }
          }

          // User bundled application code
          ${bundledJs}

          try {
            // Find root component (default export or named Page/App)
            const ComponentToRender = typeof default_default !== "undefined"
              ? default_default
              : (typeof Page !== "undefined" ? Page : (typeof App !== "undefined" ? App : null));

            const container = document.getElementById("root");
            if (container) {
              const root = createRoot(container);
              if (ComponentToRender) {
                root.render(React.createElement(ErrorBoundary, null, React.createElement(ComponentToRender, null)));
              } else {
                root.render(
                  React.createElement(
                    "div",
                    { style: { padding: "40px", textAlign: "center", color: "#6b7280" } },
                    React.createElement("h2", { style: { fontSize: "18px", color: "#111827" } }, "No Component Exported"),
                    React.createElement("p", { style: { fontSize: "13px" } }, "Make sure your component in ${entryPath} uses 'export default function ...'.")
                  )
                );
              }
            }
          } catch(err) {
            console.error("Mount error:", err);
            document.getElementById("root").innerHTML = 
              '<div style="padding:24px;margin:20px;background:#fff1f2;border:1px solid #f43f5e;border-radius:12px;font-family:monospace;color:#9f1239;">' +
              '<strong>Mount Error:</strong><br/>' + err.message +
              '</div>';
          }
        </script>
      </body>
    </html>
  `;

  return {
    success: true,
    html,
  };
}

/**
 * Compiles Vanilla HTML/CSS/JS projects.
 */
export function compileVanillaProject(project: ProjectPreviewInput): CompilationResult {
  const htmlFile =
    project.files.find((f) => f.path === "index.html" || f.name === "index.html") ||
    project.files.find((f) => f.name.endsWith(".html"));

  const cssFiles = project.files.filter((f) => f.name.endsWith(".css"));
  const jsFiles = project.files.filter((f) => f.name.endsWith(".js"));

  const cssContent = cssFiles.map((f) => f.content).join("\n\n");
  const jsContent = jsFiles.map((f) => f.content).join("\n\n");

  let baseHtml = htmlFile?.content || `
    <!DOCTYPE html>
    <html>
      <head><title>Preview</title></head>
      <body>
        <div style="font-family: sans-serif; padding: 2rem; text-align: center;">
          <h2>No HTML file found</h2>
          <p>Create an <code>index.html</code> file to see live preview.</p>
        </div>
      </body>
    </html>
  `;

  const bridge = getConsoleBridgeScript();

  // Strip external CSS/scripts that would 404 in iframe
  baseHtml = baseHtml.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, "");
  baseHtml = baseHtml.replace(/<script[^>]+src=["'][^"']*["'][^>]*><\/script>/gi, "");

  const injectedStyles = `<style>${cssContent}</style>`;
  const injectedScripts = `
    ${bridge}
    <script>
      try {
        ${jsContent}
      } catch(err) {
        console.error("Script execution error: " + err.message);
      }
    </script>
  `;

  if (baseHtml.includes("</head>")) {
    baseHtml = baseHtml.replace("</head>", `${injectedStyles}</head>`);
  } else {
    baseHtml = `${injectedStyles}${baseHtml}`;
  }

  if (baseHtml.includes("</body>")) {
    baseHtml = baseHtml.replace("</body>", `${injectedScripts}</body>`);
  } else {
    baseHtml = `${baseHtml}${injectedScripts}`;
  }

  return {
    success: true,
    html: baseHtml,
  };
}

/**
 * Main project preview compiler router.
 */
export async function compileProjectForPreview(project: ProjectPreviewInput): Promise<CompilationResult> {
  const isReactOrNext =
    project.template === "next-app" ||
    project.template === "react-ts" ||
    project.files.some((f) => f.name.endsWith(".tsx") || f.name.endsWith(".jsx"));

  if (isReactOrNext) {
    return compileReactOrNextProject(project);
  }

  return compileVanillaProject(project);
}
