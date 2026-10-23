import { Project } from "@/types/editor";

export function generatePreviewHtml(project: Project): string {
  const isReact = project.template === "react-ts";

  if (isReact) {
    return generateReactPreview(project);
  } else {
    return generateVanillaPreview(project);
  }
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

function generateVanillaPreview(project: Project): string {
  const htmlFile =
    project.files.find((f) => f.path === "index.html" || f.name.endsWith(".html")) ||
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

  // Strip existing <link rel="stylesheet"> or <script src="..."> that would fail 404
  baseHtml = baseHtml.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, "");
  baseHtml = baseHtml.replace(/<script[^>]+src=["'][^"']*["'][^>]*><\/script>/gi, "");

  // Inject CSS and JS inline
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

  return baseHtml;
}

function generateReactPreview(project: Project): string {
  const appFile =
    project.files.find((f) => f.path === "src/App.tsx" || f.name === "App.tsx") ||
    project.files.find((f) => f.name.endsWith(".tsx") || f.name.endsWith(".jsx"));

  const cssFiles = project.files.filter((f) => f.name.endsWith(".css"));
  const cssContent = cssFiles.map((f) => f.content).join("\n\n");

  let rawAppCode = appFile?.content || `
    export default function App() {
      return <div>No App.tsx found</div>;
    }
  `;

  // Strip standard external module imports for in-browser Babel execution
  rawAppCode = rawAppCode.replace(/import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["'];?/g, "");
  rawAppCode = rawAppCode.replace(/import\s+\{[^}]*\}\s+from\s+["']lucide-react["'];?/g, "");
  rawAppCode = rawAppCode.replace(/import\s+["'][^"']+\.css["'];?/g, "");

  const bridge = getConsoleBridgeScript();

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>React Preview</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          ${cssContent}
        </style>
        <!-- React 18 / 19 and Babel Standalone for safe browser transpilation -->
        <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        ${bridge}
      </head>
      <body>
        <div id="root"></div>

        <script type="text/babel" data-presets="react,typescript">
          const { useState, useEffect, useMemo, useRef, useCallback } = React;

          try {
            // Evaluated user component
            ${rawAppCode.replace(/export default function\s+([A-Za-z0-9_]+)/, "function $1")}

            const RootComponent = typeof App !== "undefined" ? App : () => (
              <div style={{ padding: "2rem", color: "#666" }}>
                Component ready. Check exports in App.tsx.
              </div>
            );

            const rootElement = document.getElementById("root");
            if (rootElement) {
              const root = ReactDOM.createRoot(rootElement);
              root.render(<RootComponent />);
            }
          } catch(err) {
            console.error("React Runtime Error: " + err.message);
            document.getElementById("root").innerHTML = 
              '<div style="padding: 1.5rem; color: #dc2626; background: #fee2e2; border-radius: 8px; font-family: monospace; margin: 1rem;">' +
              '<strong>Runtime Error:</strong><br/>' + err.message +
              '</div>';
          }
        </script>
      </body>
    </html>
  `;
}

