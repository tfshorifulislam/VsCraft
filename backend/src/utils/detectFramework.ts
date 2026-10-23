import { ProjectTemplate } from "../types/editor";

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
      // ignore
    }
  }

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
      suggestedTools: ["python main.py", "pytest", "pip install"],
    };
  }

  if (filePaths.has("Cargo.toml") || Array.from(filePaths).some((p) => p.endsWith(".rs"))) {
    return {
      template: "rust",
      frameworkName: "Rust Cargo Package",
      runtime: "Rust toolchain",
      language: "Rust",
      confidence: "high",
      suggestedTools: ["cargo run", "cargo test", "cargo check"],
    };
  }

  if (filePaths.has("go.mod") || Array.from(filePaths).some((p) => p.endsWith(".go"))) {
    return {
      template: "go",
      frameworkName: "Go Module",
      runtime: "Go 1.22+",
      language: "Go",
      confidence: "high",
      suggestedTools: ["go run .", "go test ./...", "go build"],
    };
  }

  if (filePaths.has("index.html") || Array.from(filePaths).some((p) => p.endsWith(".html"))) {
    return {
      template: "vanilla-web",
      frameworkName: "Static Web (HTML/CSS/JS)",
      runtime: "Browser Preview",
      language: "HTML / CSS / JavaScript",
      confidence: "high",
      suggestedTools: ["Live Preview", "W3C Validation"],
    };
  }

  return {
    template: "vanilla-web",
    frameworkName: "Generic Workspace",
    runtime: "Standard",
    language: "Plain Text / Code",
    confidence: "low",
    suggestedTools: ["Terminal", "File Explorer"],
  };
}
