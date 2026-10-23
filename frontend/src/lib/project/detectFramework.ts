import { ProjectTemplate } from "@/types/editor";

export interface DetectionResult {
  template: ProjectTemplate;
  frameworkName: string;
  runtime: string;
  language: string;
  confidence: "high" | "medium" | "low";
  suggestedTools: string[];
}

export function detectProjectFramework(
  files: { path: string; name: string; content?: string }[]
): DetectionResult {
  const filePaths = new Set(files.map((f) => f.path.replace(/^\/+/, "").replace(/\\/g, "/")));

  // 1. Check for Node / JavaScript / TypeScript ecosystem
  const packageJsonFile = files.find(
    (f) => f.path.replace(/^\/+/, "") === "package.json" || f.name === "package.json"
  );

  if (packageJsonFile && packageJsonFile.content) {
    try {
      const pkg = JSON.parse(packageJsonFile.content);
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      if (allDeps["next"]) {
        const isTs = filePaths.has("tsconfig.json") || Array.from(filePaths).some((p) => p.endsWith(".tsx") || p.endsWith(".ts"));
        return {
          template: "next-app",
          frameworkName: `Next.js ${allDeps["next"] || ""}`,
          runtime: "Node.js / React 19",
          language: isTs ? "TypeScript" : "JavaScript",
          confidence: "high",
          suggestedTools: ["npm run dev", "npm run build", "Tailwind CSS"],
        };
      }

      if (allDeps["react"]) {
        const isVite = Boolean(allDeps["vite"] || allDeps["@vitejs/plugin-react"] || filePaths.has("vite.config.ts") || filePaths.has("vite.config.js"));
        const isTs = filePaths.has("tsconfig.json") || Array.from(filePaths).some((p) => p.endsWith(".tsx") || p.endsWith(".ts"));
        return {
          template: "react-ts",
          frameworkName: isVite ? "React + Vite" : "React Application",
          runtime: isVite ? "Vite Dev Server" : "Node.js",
          language: isTs ? "TypeScript" : "JavaScript",
          confidence: "high",
          suggestedTools: ["npm run dev", "npm run lint", "TypeScript"],
        };
      }

      if (allDeps["express"] || allDeps["fastify"] || allDeps["koa"] || allDeps["@nestjs/core"]) {
        const isTs = filePaths.has("tsconfig.json") || Array.from(filePaths).some((p) => p.endsWith(".ts"));
        return {
          template: "node-api",
          frameworkName: allDeps["@nestjs/core"]
            ? "NestJS API"
            : allDeps["fastify"]
            ? "Fastify Server"
            : "Express REST API",
          runtime: "Node.js",
          language: isTs ? "TypeScript" : "JavaScript",
          confidence: "high",
          suggestedTools: ["node server.js", "npm test", "REST Client"],
        };
      }

      return {
        template: "node-api",
        frameworkName: "Node.js Application",
        runtime: "Node.js",
        language: "JavaScript / TypeScript",
        confidence: "medium",
        suggestedTools: ["npm test", "npm run dev"],
      };
    } catch {
      // If package.json is malformed or unreadable, fall through
    }
  }

  // 2. Python detection
  const hasRequirements = filePaths.has("requirements.txt") || filePaths.has("pyproject.toml") || filePaths.has("Pipfile");
  const hasPythonFiles = Array.from(filePaths).some((p) => p.endsWith(".py"));
  if (hasRequirements || hasPythonFiles) {
    let framework = "Python";
    const reqFile = files.find((f) => f.path.replace(/^\/+/, "") === "requirements.txt");
    if (reqFile?.content) {
      if (reqFile.content.includes("fastapi")) framework = "FastAPI (Python)";
      else if (reqFile.content.includes("flask")) framework = "Flask (Python)";
      else if (reqFile.content.includes("django")) framework = "Django (Python)";
    }
    return {
      template: "python",
      frameworkName: framework,
      runtime: "Python 3.11+",
      language: "Python",
      confidence: hasRequirements ? "high" : "medium",
      suggestedTools: ["python -m venv", "pip install -r requirements.txt", "pytest"],
    };
  }

  // 3. Rust detection
  if (filePaths.has("Cargo.toml")) {
    return {
      template: "rust",
      frameworkName: "Rust Cargo Package",
      runtime: "Rustc / Cargo",
      language: "Rust",
      confidence: "high",
      suggestedTools: ["cargo check", "cargo build", "cargo test"],
    };
  }

  // 4. Go detection
  if (filePaths.has("go.mod")) {
    return {
      template: "go",
      frameworkName: "Go Module",
      runtime: "Go 1.22+",
      language: "Go",
      confidence: "high",
      suggestedTools: ["go run .", "go test ./...", "go mod tidy"],
    };
  }

  // 5. Static Web
  if (filePaths.has("index.html")) {
    return {
      template: "blank",
      frameworkName: "HTML / CSS / JavaScript",
      runtime: "Web Browser",
      language: "HTML5",
      confidence: "medium",
      suggestedTools: ["Live Server Preview", "ESLint"],
    };
  }

  // 6. Generic / Blank
  return {
    template: "blank",
    frameworkName: "Empty / Polyglot Workspace",
    runtime: "Generic",
    language: "Plain Text / Code",
    confidence: "low",
    suggestedTools: ["Initialize Framework", "Add Tooling"],
  };
}

