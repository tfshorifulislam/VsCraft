import { Project, ProjectFile, ProjectTemplate, EditorSettings } from "@/types/editor";

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

// 1. React + TypeScript Template
export const STARTER_REACT_TS_FILES: ProjectFile[] = [
  {
    id: "f-root-src",
    name: "src",
    path: "src",
    content: "",
    language: "",
    isFolder: true,
    parentId: null,
  },
  {
    id: "f-app-tsx",
    name: "App.tsx",
    path: "src/App.tsx",
    content: `import React, { useState, type FormEvent } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  const [todos, setTodos] = useState([
    { id: 1, text: "Explore Code Editor workspace", done: true },
    { id: 2, text: "Try the AI Coding Assistant", done: false },
    { id: 3, text: "Inspect live web preview", done: false },
  ]);
  const [newTodo, setNewTodo] = useState("");

  const addTodo = (e: FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    setTodos([...todos, { id: Date.now(), text: newTodo.trim(), done: false }]);
    setNewTodo("");
    console.log("Added task:", newTodo);
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "640px", margin: "0 auto", color: "#1f2937" }}>
      <header style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ display: "inline-block", background: "#f3f0ff", color: "#6c5ce7", padding: "0.25rem 0.75rem", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          ✦ Running in Code Editor
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: 0, color: "#111827" }}>
          Interactive React Project
        </h1>
        <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
          Edit <code>src/App.tsx</code> and see instant live updates in preview!
        </p>
      </header>

      <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.2rem", margin: "0 0 1rem 0" }}>Interactive Counter</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button 
            onClick={() => setCount(c => c - 1)}
            style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer", fontWeight: 600 }}
          >
            -
          </button>
          <span style={{ fontSize: "1.5rem", fontWeight: 700, minWidth: "3rem", textAlign: "center" }}>
            {count}
          </span>
          <button 
            onClick={() => setCount(c => c + 1)}
            style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "none", background: "#6c5ce7", color: "#fff", cursor: "pointer", fontWeight: 600 }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: "1.2rem", margin: "0 0 1rem 0" }}>Project Tasks</h2>
        <form onSubmit={addTodo} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <input 
            type="text" 
            value={newTodo} 
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Add new task..." 
            style={{ flex: 1, padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #d1d5db", outline: "none" }}
          />
          <button type="submit" style={{ padding: "0.6rem 1.2rem", borderRadius: "8px", border: "none", background: "#6c5ce7", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Add
          </button>
        </form>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {todos.map(todo => (
            <li 
              key={todo.id} 
              onClick={() => toggleTodo(todo.id)}
              style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", borderRadius: "6px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
            >
              <input type="checkbox" checked={todo.done} readOnly style={{ cursor: "pointer" }} />
              <span style={{ textDecoration: todo.done ? "line-through" : "none", color: todo.done ? "#9ca3af" : "#111827" }}>
                {todo.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}`,
    language: "typescript",
    isFolder: false,
    parentId: "f-root-src",
  },
  {
    id: "f-index-tsx",
    name: "index.tsx",
    path: "src/index.tsx",
    content: `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}`,
    language: "typescript",
    isFolder: false,
    parentId: "f-root-src",
  },
  {
    id: "f-styles-css",
    name: "styles.css",
    path: "src/styles.css",
    content: `* { box-sizing: border-box; }
body { margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; font-family: system-ui, sans-serif; }
code { background: #f1f5f9; padding: 0.15rem 0.35rem; border-radius: 4px; font-family: monospace; }`,
    language: "css",
    isFolder: false,
    parentId: "f-root-src",
  },
  {
    id: "f-index-html",
    name: "index.html",
    path: "index.html",
    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
    language: "html",
    isFolder: false,
    parentId: null,
  },
  {
    id: "f-package-json",
    name: "package.json",
    path: "package.json",
    content: `{
  "name": "react-code-editor-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}`,
    language: "json",
    isFolder: false,
    parentId: null,
  },
];

// 2. Vanilla Web (HTML, CSS, JS) Template
export const STARTER_VANILLA_FILES: ProjectFile[] = [
  {
    id: "v-index-html",
    name: "index.html",
    path: "index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Modern Web App</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="card">
    <div class="badge">✦ Browser Workspace</div>
    <h1>Hello, Code Editor!</h1>
    <p>This is a live vanilla JavaScript, HTML, and CSS web project.</p>
    
    <div class="counter-box">
      <button id="btn-minus">-</button>
      <span id="counter-value">0</span>
      <button id="btn-plus">+</button>
    </div>

    <div class="input-row">
      <input type="text" id="log-input" placeholder="Type a message for console...">
      <button id="btn-log">Log</button>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>`,
    language: "html",
    isFolder: false,
    parentId: null,
  },
  {
    id: "v-styles-css",
    name: "styles.css",
    path: "styles.css",
    content: `body {
  font-family: system-ui, -apple-system, sans-serif;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
  padding: 1rem;
}
.card {
  background: white;
  padding: 2.5rem;
  border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  max-width: 440px;
  width: 100%;
  text-align: center;
}
.badge {
  display: inline-block;
  background: #f3f0ff;
  color: #6c5ce7;
  padding: 0.3rem 0.8rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
h1 { font-size: 1.8rem; margin: 0 0 0.5rem 0; color: #1a1a1a; }
p { color: #666; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.8rem; }
.counter-box { display: flex; align-items: center; justify-content: center; gap: 1.2rem; margin-bottom: 1.5rem; }
button { background: #6c5ce7; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
#btn-minus { background: #e2e8f0; color: #1e293b; }
#counter-value { font-size: 1.8rem; font-weight: 700; min-width: 2.5rem; }
.input-row { display: flex; gap: 0.5rem; margin-top: 1rem; }
input { flex: 1; padding: 0.6rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; outline: none; }`,
    language: "css",
    isFolder: false,
    parentId: null,
  },
  {
    id: "v-app-js",
    name: "app.js",
    path: "app.js",
    content: `let count = 0;
const counterVal = document.getElementById("counter-value");
const btnPlus = document.getElementById("btn-plus");
const btnMinus = document.getElementById("btn-minus");
const btnLog = document.getElementById("btn-log");
const logInput = document.getElementById("log-input");

btnPlus?.addEventListener("click", () => {
  count++;
  if (counterVal) counterVal.textContent = count;
  console.log("Count:", count);
});

btnMinus?.addEventListener("click", () => {
  count--;
  if (counterVal) counterVal.textContent = count;
  console.log("Count:", count);
});

btnLog?.addEventListener("click", () => {
  const msg = logInput?.value.trim();
  if (msg) {
    console.log("[User Log]:", msg);
    logInput.value = "";
  }
});

console.log("Vanilla Web project ready!");`,
    language: "javascript",
    isFolder: false,
    parentId: null,
  },
  {
    id: "v-readme-md",
    name: "README.md",
    path: "README.md",
    content: `# Vanilla Web Project\n\nEdit \`index.html\`, \`styles.css\`, and \`app.js\` to build lightweight web apps.`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

// 3. Next.js Web App Template
export const STARTER_NEXT_FILES: ProjectFile[] = [
  {
    id: "n-app-folder",
    name: "app",
    path: "app",
    content: "",
    language: "",
    isFolder: true,
    parentId: null,
  },
  {
    id: "n-page-tsx",
    name: "page.tsx",
    path: "app/page.tsx",
    content: `export default function Page() {
  return (
    <main style={{ padding: "3rem", fontFamily: "system-ui, sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ display: "inline-block", background: "#f3f0ff", color: "#6c5ce7", padding: "0.3rem 0.8rem", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600 }}>
        Next.js App Router
      </div>
      <h1 style={{ fontSize: "2.5rem", fontWeight: 800, marginTop: "1rem", color: "#111827" }}>
        Modern Fullstack Project
      </h1>
      <p style={{ color: "#4b5563", fontSize: "1.1rem", lineHeight: 1.6 }}>
        Build server-rendered pages and API endpoints with Next.js architecture.
      </p>
    </main>
  );
}`,
    language: "typescript",
    isFolder: false,
    parentId: "n-app-folder",
  },
  {
    id: "n-layout-tsx",
    name: "layout.tsx",
    path: "app/layout.tsx",
    content: `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#ffffff" }}>
        {children}
      </body>
    </html>
  );
}`,
    language: "typescript",
    isFolder: false,
    parentId: "n-app-folder",
  },
  {
    id: "n-package-json",
    name: "package.json",
    path: "package.json",
    content: `{\n  "name": "nextjs-web-app",\n  "version": "1.0.0",\n  "dependencies": {\n    "next": "^15.0.0",\n    "react": "^19.0.0",\n    "react-dom": "^19.0.0"\n  }\n}`,
    language: "json",
    isFolder: false,
    parentId: null,
  },
  {
    id: "n-readme-md",
    name: "README.md",
    path: "README.md",
    content: `# Next.js Starter\n\nNext.js App Router project template.`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

// 4. Node.js API Service Template
export const STARTER_NODE_FILES: ProjectFile[] = [
  {
    id: "node-server-js",
    name: "server.js",
    path: "server.js",
    content: `// Node.js REST API Server
const http = require("http");

const users = [
  { id: 1, name: "Alice Developer", role: "Frontend Engineer" },
  { id: 2, name: "Bob Designer", role: "UI/UX Product Designer" },
];

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/api/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
  }

  if (req.url === "/api/users") {
    res.writeHead(200);
    return res.end(JSON.stringify({ data: users }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Route not found" }));
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(\`Server listening on http://localhost:\${PORT}\`);
});`,
    language: "javascript",
    isFolder: false,
    parentId: null,
  },
  {
    id: "node-package-json",
    name: "package.json",
    path: "package.json",
    content: `{\n  "name": "node-microservice",\n  "version": "1.0.0",\n  "main": "server.js",\n  "scripts": { "start": "node server.js" }\n}`,
    language: "json",
    isFolder: false,
    parentId: null,
  },
  {
    id: "node-readme-md",
    name: "README.md",
    path: "README.md",
    content: `# Node.js API Service\n\nLightweight REST endpoints ready for API testing and backend development.`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

// 5. Blank Project Template
export const STARTER_BLANK_FILES: ProjectFile[] = [
  {
    id: "b-index-html",
    name: "index.html",
    path: "index.html",
    content: `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>Blank Project</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Blank Project Ready</h1>\n  <p>Start writing your code here.</p>\n  <script src="main.js"></script>\n</body>\n</html>`,
    language: "html",
    isFolder: false,
    parentId: null,
  },
  {
    id: "b-style-css",
    name: "style.css",
    path: "style.css",
    content: `body { font-family: sans-serif; padding: 2rem; }`,
    language: "css",
    isFolder: false,
    parentId: null,
  },
  {
    id: "b-main-js",
    name: "main.js",
    path: "main.js",
    content: `console.log("Workspace initialized.");`,
    language: "javascript",
    isFolder: false,
    parentId: null,
  },
  {
    id: "b-readme-md",
    name: "README.md",
    path: "README.md",
    content: `# Blank Project\n\nClean project scratchpad.`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

// 6. Python 3 Application Template
export const STARTER_PYTHON_FILES: ProjectFile[] = [
  {
    id: "py-main",
    name: "main.py",
    path: "main.py",
    content: `"""
Python 3 Cloud Service
Fast data processor and REST API endpoints.
"""
import sys
import json
from datetime import datetime

def analyze_data(values):
    return {
        "count": len(values),
        "sum": sum(values),
        "mean": sum(values) / len(values) if values else 0,
        "max": max(values) if values else 0,
        "min": min(values) if values else 0,
    }

def main():
    print("=" * 40)
    print("Python 3 Cloud Workspace Running")
    print(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    print("=" * 40)

    sample_metrics = [42, 88, 19, 73, 95, 61, 54]
    results = analyze_data(sample_metrics)
    print("\\n[Analysis Summary]:")
    print(json.dumps(results, indent=2))
    print("\\nReady for live Python execution.")

if __name__ == "__main__":
    main()
`,
    language: "python",
    isFolder: false,
    parentId: null,
  },
  {
    id: "py-reqs",
    name: "requirements.txt",
    path: "requirements.txt",
    content: `fastapi>=0.110.0\nuvicorn>=0.28.0\npydantic>=2.6.0\nrequests>=2.31.0\npytest>=8.0.0\n`,
    language: "plaintext",
    isFolder: false,
    parentId: null,
  },
  {
    id: "py-readme",
    name: "README.md",
    path: "README.md",
    content: `# Python 3 Cloud Workspace\n\nRun with:\n\`\`\`bash\npython main.py\n\`\`\`\n\nInstall dependencies:\n\`\`\`bash\npip install -r requirements.txt\n\`\`\`\n`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

// 7. C++ High-Performance Systems Template
export const STARTER_CPP_FILES: ProjectFile[] = [
  {
    id: "cpp-main",
    name: "main.cpp",
    path: "main.cpp",
    content: `// C++20 Systems Application
#include <iostream>
#include <vector>
#include <numeric>
#include <iomanip>

int main() {
    std::cout << "========================================\\n";
    std::cout << "   C++20 Cloud Workspace Initialized    \\n";
    std::cout << "========================================\\n";

    std::vector<int> numbers = {10, 20, 30, 40, 50, 100};
    int total = std::accumulate(numbers.begin(), numbers.end(), 0);
    double avg = static_cast<double>(total) / numbers.size();

    std::cout << "Element count: " << numbers.size() << "\\n";
    std::cout << "Total sum:     " << total << "\\n";
    std::cout << "Average:       " << std::fixed << std::setprecision(2) << avg << "\\n";
    std::cout << "\\nCompiled and executed natively.\\n";

    return 0;
}
`,
    language: "cpp",
    isFolder: false,
    parentId: null,
  },
  {
    id: "cpp-makefile",
    name: "Makefile",
    path: "Makefile",
    content: `CXX = g++\nCXXFLAGS = -std=c++20 -Wall -O2\nTARGET = app\n\nall: $(TARGET)\n\n$(TARGET): main.cpp\n\t$(CXX) $(CXXFLAGS) -o $(TARGET) main.cpp\n\nclean:\n\trm -f $(TARGET)\n\nrun: $(TARGET)\n\t./$(TARGET)\n`,
    language: "plaintext",
    isFolder: false,
    parentId: null,
  },
  {
    id: "cpp-readme",
    name: "README.md",
    path: "README.md",
    content: `# C++ Workspace\n\nCompile and run:\n\`\`\`bash\nmake run\n\`\`\`\n`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

// 8. Go Cloud Microservice Template
export const STARTER_GO_FILES: ProjectFile[] = [
  {
    id: "go-main",
    name: "main.go",
    path: "main.go",
    content: `// Go Cloud Microservice
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

type ServerStatus struct {
	Service   string    \`json:"service"\`
	Status    string    \`json:"status"\`
	Timestamp time.Time \`json:"timestamp"\`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	status := ServerStatus{
		Service:   "Go Microservice Engine",
		Status:    "Healthy",
		Timestamp: time.Now().UTC(),
	}
	json.NewEncoder(w).Encode(status)
}

func main() {
	fmt.Println("Starting Go Microservice on http://localhost:8080...")
	http.HandleFunc("/api/health", healthHandler)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello from Go Cloud IDE Workspace! Time: %s", time.Now().Format(time.RFC3339))
	})
	log.Fatal(http.ListenAndServe(":8080", nil))
}
`,
    language: "go",
    isFolder: false,
    parentId: null,
  },
  {
    id: "go-mod",
    name: "go.mod",
    path: "go.mod",
    content: `module cloud-service\n\ngo 1.22\n`,
    language: "plaintext",
    isFolder: false,
    parentId: null,
  },
  {
    id: "go-readme",
    name: "README.md",
    path: "README.md",
    content: `# Go Microservice\n\nRun server:\n\`\`\`bash\ngo run main.go\n\`\`\`\n`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

// 9. Rust Systems Project Template
export const STARTER_RUST_FILES: ProjectFile[] = [
  {
    id: "rust-src",
    name: "src",
    path: "src",
    content: "",
    language: "",
    isFolder: true,
    parentId: null,
  },
  {
    id: "rust-main",
    name: "main.rs",
    path: "src/main.rs",
    content: `// Rust High-Performance Application
fn main() {
    println!("==========================================");
    println!("  🦀 Rust Cloud Workspace Initialized!   ");
    println!("==========================================");

    let items = vec!["Fast", "Memory-Safe", "Concurrent", "Modern"];
    for (idx, feature) in items.iter().enumerate() {
        println!("{}. Rust is {}", idx + 1, feature);
    }

    println!("\\nReady for cargo build and run.");
}
`,
    language: "rust",
    isFolder: false,
    parentId: "rust-src",
  },
  {
    id: "rust-cargo",
    name: "Cargo.toml",
    path: "Cargo.toml",
    content: `[package]\nname = "rust-workspace"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1.0", features = ["derive"] }\nserde_json = "1.0"\ntokio = { version = "1.0", features = ["full"] }\n`,
    language: "toml",
    isFolder: false,
    parentId: null,
  },
  {
    id: "rust-readme",
    name: "README.md",
    path: "README.md",
    content: `# Rust Application\n\nRun with Cargo:\n\`\`\`bash\ncargo run\n\`\`\`\n`,
    language: "markdown",
    isFolder: false,
    parentId: null,
  },
];

export function getTemplateFiles(template: ProjectTemplate): {
  files: ProjectFile[];
  activeFileId: string;
  openFileIds: string[];
} {
  switch (template) {
    case "react-ts":
      return {
        files: STARTER_REACT_TS_FILES,
        activeFileId: "f-app-tsx",
        openFileIds: ["f-app-tsx", "f-styles-css", "f-package-json"],
      };
    case "vanilla-web":
      return {
        files: STARTER_VANILLA_FILES,
        activeFileId: "v-index-html",
        openFileIds: ["v-index-html", "v-styles-css", "v-app-js"],
      };
    case "next-app":
      return {
        files: STARTER_NEXT_FILES,
        activeFileId: "n-page-tsx",
        openFileIds: ["n-page-tsx", "n-layout-tsx", "n-package-json"],
      };
    case "node-api":
      return {
        files: STARTER_NODE_FILES,
        activeFileId: "node-server-js",
        openFileIds: ["node-server-js", "node-package-json", "node-readme-md"],
      };
    case "python":
      return {
        files: STARTER_PYTHON_FILES,
        activeFileId: "py-main",
        openFileIds: ["py-main", "py-reqs", "py-readme"],
      };
    case "cpp":
      return {
        files: STARTER_CPP_FILES,
        activeFileId: "cpp-main",
        openFileIds: ["cpp-main", "cpp-makefile", "cpp-readme"],
      };
    case "go":
      return {
        files: STARTER_GO_FILES,
        activeFileId: "go-main",
        openFileIds: ["go-main", "go-mod", "go-readme"],
      };
    case "rust":
      return {
        files: STARTER_RUST_FILES,
        activeFileId: "rust-main",
        openFileIds: ["rust-main", "rust-cargo", "rust-readme"],
      };
    case "blank":
    default:
      return {
        files: STARTER_BLANK_FILES,
        activeFileId: "b-index-html",
        openFileIds: ["b-index-html", "b-style-css", "b-main-js"],
      };
  }
}

export function createStarterProject(
  template: ProjectTemplate = "react-ts",
  name?: string,
  description?: string
): Project {
  const { files, activeFileId, openFileIds } = getTemplateFiles(template);
  const now = Date.now();

  const defaultNames: Record<ProjectTemplate, string> = {
    "react-ts": "Interactive React App",
    "vanilla-web": "Modern Web Application",
    "next-app": "Next.js App Router Service",
    "node-api": "Node.js REST API",
    python: "Python 3 Analytics Service",
    cpp: "C++20 High Performance App",
    go: "Go Cloud Microservice",
    rust: "Rust Systems Project",
    blank: "Blank Project Scratchpad",
  };

  return {
    id: `proj-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || defaultNames[template] || "New Project",
    template,
    description: description || `Created with ${template} starter template.`,
    files,
    activeFileId,
    openFileIds,
    starred: false,
    isTrash: false,
    createdAt: now,
    updatedAt: now,
  };
}

const STORAGE_KEY_PROJECTS = "code_editor_projects_v2";
const STORAGE_KEY_ACTIVE_PROJECT = "code_editor_active_project_id_v2";
const STORAGE_KEY_SETTINGS = "code_editor_settings_v2";

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load projects from localStorage", err);
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  } catch (err) {
    console.error("Failed to save projects to localStorage", err);
  }
}

export function getProjectById(id: string): Project | undefined {
  const all = loadProjects();
  return all.find((p) => p.id === id);
}

export function loadActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT);
}

export function saveActiveProjectId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, id);
}

export function duplicateProject(id: string): Project | null {
  const all = loadProjects();
  const target = all.find((p) => p.id === id);
  if (!target) return null;

  const duplicated: Project = {
    ...target,
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${target.name} (Copy)`,
    starred: false,
    isTrash: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const next = [duplicated, ...all];
  saveProjects(next);
  return duplicated;
}

export function toggleStarProject(id: string): boolean {
  const all = loadProjects();
  let nextStarred = false;
  const next = all.map((p) => {
    if (p.id === id) {
      nextStarred = !p.starred;
      return { ...p, starred: nextStarred, updatedAt: Date.now() };
    }
    return p;
  });
  saveProjects(next);
  return nextStarred;
}

export function renameProject(id: string, newName: string): boolean {
  const all = loadProjects();
  const next = all.map((p) => {
    if (p.id === id) {
      return { ...p, name: newName.trim(), updatedAt: Date.now() };
    }
    return p;
  });
  saveProjects(next);
  return true;
}

export function trashProject(id: string): boolean {
  const all = loadProjects();
  const next = all.map((p) => {
    if (p.id === id) {
      return { ...p, isTrash: true, trashedAt: Date.now(), updatedAt: Date.now() };
    }
    return p;
  });
  saveProjects(next);
  return true;
}

export function restoreProject(id: string): boolean {
  const all = loadProjects();
  const next = all.map((p) => {
    if (p.id === id) {
      return { ...p, isTrash: false, trashedAt: undefined, updatedAt: Date.now() };
    }
    return p;
  });
  saveProjects(next);
  return true;
}

export function deleteProjectPermanently(id: string): boolean {
  const all = loadProjects();
  const next = all.filter((p) => p.id !== id);
  saveProjects(next);
  return true;
}

export function emptyTrash(): void {
  const all = loadProjects();
  const next = all.filter((p) => !p.isTrash);
  saveProjects(next);
}

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
