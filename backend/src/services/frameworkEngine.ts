import { ProjectFile, NextJsConfig, FrameworkInitOptions } from "../types/editor";

export function generateEmptyWorkspaceFiles(): { files: Omit<ProjectFile, "id" | "projectId">[]; activeFileId: string | null; openFileIds: string[] } {
  return {
    files: [],
    activeFileId: null,
    openFileIds: [],
  };
}

export function generateBasicWebFiles(initGit: boolean = false): { files: Omit<ProjectFile, "id" | "projectId">[]; activeFileId: string | null; openFileIds: string[] } {
  const files: Omit<ProjectFile, "id" | "projectId">[] = [
    {
      name: "index.html",
      path: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Web Project</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p>Your clean web project is ready for development.</p>
  </div>
  <script src="main.js"></script>
</body>
</html>
`,
      language: "html",
      isFolder: false,
      parentId: null,
    },
    {
      name: "styles.css",
      path: "styles.css",
      content: `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.container {
  background: white;
  padding: 2.5rem;
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  text-align: center;
}

h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}
`,
      language: "css",
      isFolder: false,
      parentId: null,
    },
    {
      name: "main.js",
      path: "main.js",
      content: `// Workspace JavaScript
console.log("Project initialized successfully.");
`,
      language: "javascript",
      isFolder: false,
      parentId: null,
    },
  ];

  if (initGit) {
    files.push({
      name: ".gitignore",
      path: ".gitignore",
      content: `node_modules/\n.DS_Store\n*.log\n`,
      language: "plaintext",
      isFolder: false,
      parentId: null,
    });
  }

  return {
    files,
    activeFileId: "index.html",
    openFileIds: ["index.html", "styles.css"],
  };
}

export function generateNextJsProjectFiles(config?: Partial<NextJsConfig>): {
  files: Omit<ProjectFile, "id" | "projectId">[];
  activeFileId: string | null;
  openFileIds: string[];
} {
  const isTs = config?.typescript !== false;
  const isTw = config?.tailwind !== false;
  const isShadcn = Boolean(config?.shadcn);
  const isEslint = config?.eslint !== false;

  const pkgDependencies: Record<string, string> = {
    next: "^15.1.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
  };

  if (isShadcn) {
    pkgDependencies["clsx"] = "^2.1.1";
    pkgDependencies["tailwind-merge"] = "^2.5.5";
    pkgDependencies["class-variance-authority"] = "^0.7.1";
    pkgDependencies["lucide-react"] = "^0.469.0";
    pkgDependencies["@radix-ui/react-slot"] = "^1.1.1";
  }

  const pkgDevDependencies: Record<string, string> = {};
  if (isTs) {
    pkgDevDependencies["typescript"] = "^5.7.2";
    pkgDevDependencies["@types/node"] = "^22.10.2";
    pkgDevDependencies["@types/react"] = "^19.0.2";
    pkgDevDependencies["@types/react-dom"] = "^19.0.2";
  }
  if (isTw) {
    pkgDevDependencies["tailwindcss"] = "^3.4.17";
    pkgDevDependencies["postcss"] = "^8.4.49";
    pkgDevDependencies["autoprefixer"] = "^10.4.20";
  }
  if (isEslint) {
    pkgDevDependencies["eslint"] = "^9.17.0";
    pkgDevDependencies["eslint-config-next"] = "15.1.0";
  }

  const packageJsonContent = JSON.stringify(
    {
      name: "nextjs-app",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
      },
      dependencies: pkgDependencies,
      devDependencies: pkgDevDependencies,
    },
    null,
    2
  );

  const files: Omit<ProjectFile, "id" | "projectId">[] = [
    {
      name: "package.json",
      path: "package.json",
      content: packageJsonContent,
      language: "json",
      isFolder: false,
      parentId: null,
    },
    {
      name: "next.config.ts",
      path: "next.config.ts",
      content: `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`,
      language: "typescript",
      isFolder: false,
      parentId: null,
    },
    {
      name: "tsconfig.json",
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            baseUrl: ".",
            paths: {
              "@/*": ["./*", "./src/*"],
            },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2
      ),
      language: "json",
      isFolder: false,
      parentId: null,
    },
    {
      name: ".gitignore",
      path: ".gitignore",
      content: `node_modules/\n.next/\nout/\n.DS_Store\n*.log\n.env*.local\n`,
      language: "plaintext",
      isFolder: false,
      parentId: null,
    },
    // app folder
    {
      name: "app",
      path: "app",
      content: "",
      language: "",
      isFolder: true,
      parentId: null,
    },
    {
      name: "layout.tsx",
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next.js Application",
  description: "Built with Next.js App Router and modern developer tooling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
`,
      language: "typescript",
      isFolder: false,
      parentId: null,
    },
  ];

  if (isTw) {
    files.push(
      {
        name: "tailwind.config.ts",
        path: "tailwind.config.ts",
        content: `import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
`,
        language: "typescript",
        isFolder: false,
        parentId: null,
      },
      {
        name: "postcss.config.mjs",
        path: "postcss.config.mjs",
        content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
        language: "javascript",
        isFolder: false,
        parentId: null,
      }
    );
  }

  // globals.css
  const globalsCss = isTw
    ? `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`
    : `body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #ffffff;
  color: #171717;
}
`;

  files.push({
    name: "globals.css",
    path: "app/globals.css",
    content: globalsCss,
    language: "css",
    isFolder: false,
    parentId: null,
  });

  // If shadcn/ui is selected, inject components.json, utils, and Button & Card components!
  if (isShadcn) {
    files.push(
      {
        name: "components.json",
        path: "components.json",
        content: JSON.stringify(
          {
            $schema: "https://ui.shadcn.com/schema.json",
            style: "default",
            rsc: true,
            tsx: true,
            tailwind: {
              config: "tailwind.config.ts",
              css: "app/globals.css",
              baseColor: "neutral",
              cssVariables: true,
            },
            aliases: {
              components: "@/components",
              utils: "@/lib/utils",
              ui: "@/components/ui",
            },
          },
          null,
          2
        ),
        language: "json",
        isFolder: false,
        parentId: null,
      },
      // lib folder & utils.ts
      {
        name: "lib",
        path: "lib",
        content: "",
        language: "",
        isFolder: true,
        parentId: null,
      },
      {
        name: "utils.ts",
        path: "lib/utils.ts",
        content: `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
        language: "typescript",
        isFolder: false,
        parentId: null,
      },
      // components folder & ui folder
      {
        name: "components",
        path: "components",
        content: "",
        language: "",
        isFolder: true,
        parentId: null,
      },
      {
        name: "ui",
        path: "components/ui",
        content: "",
        language: "",
        isFolder: true,
        parentId: null,
      },
      {
        name: "button.tsx",
        path: "components/ui/button.tsx",
        content: `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
`,
        language: "typescript",
        isFolder: false,
        parentId: null,
      },
      {
        name: "card.tsx",
        path: "components/ui/card.tsx",
        content: `import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
`,
        language: "typescript",
        isFolder: false,
        parentId: null,
      }
    );

    // page.tsx showcasing shadcn components
    files.push({
      name: "page.tsx",
      path: "app/page.tsx",
      content: `import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Sparkles, ArrowRight, Code2 } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 sm:p-12 flex flex-col items-center justify-center">
      <Card className="w-full max-w-lg shadow-xl border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase mb-1">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span>Next.js + shadcn/ui</span>
          </div>
          <CardTitle className="text-2xl font-bold">Workspace Ready</CardTitle>
          <CardDescription>
            Configured with Tailwind CSS, TypeScript, and official shadcn/ui components.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-neutral-100 dark:bg-neutral-900 rounded-lg text-xs font-mono text-neutral-600 dark:text-neutral-400">
            components/ui/button.tsx & components/ui/card.tsx
          </div>
          <div className="flex items-center gap-3">
            <Button className="w-full sm:w-auto">
              <span>Explore Components</span>
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Button variant="outline">Docs</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
`,
      language: "typescript",
      isFolder: false,
      parentId: null,
    });
  } else {
    // Standard page.tsx
    files.push({
      name: "page.tsx",
      path: "app/page.tsx",
      content: `export default function Home() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center font-sans">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-3">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
          Next.js App Router
        </span>
        <h1 className="text-2xl font-bold text-neutral-900">Project Initialized</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          Edit <code>app/page.tsx</code> to start building your application.
        </p>
      </div>
    </main>
  );
}
`,
      language: "typescript",
      isFolder: false,
      parentId: null,
    });
  }

  return {
    files,
    activeFileId: "app/page.tsx",
    openFileIds: ["app/page.tsx", "package.json"],
  };
}

export function generateReactViteFiles(): {
  files: Omit<ProjectFile, "id" | "projectId">[];
  activeFileId: string | null;
  openFileIds: string[];
} {
  const files: Omit<ProjectFile, "id" | "projectId">[] = [
    {
      name: "package.json",
      path: "package.json",
      content: JSON.stringify(
        {
          name: "react-vite-app",
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc -b && vite build",
            lint: "eslint .",
            preview: "vite preview",
          },
          dependencies: {
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            "lucide-react": "^0.469.0",
          },
          devDependencies: {
            "@types/react": "^19.0.2",
            "@types/react-dom": "^19.0.2",
            "@vitejs/plugin-react": "^4.3.4",
            typescript: "~5.7.2",
            vite: "^6.0.5",
          },
        },
        null,
        2
      ),
      language: "json",
      isFolder: false,
      parentId: null,
    },
    {
      name: "vite.config.ts",
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
      language: "typescript",
      isFolder: false,
      parentId: null,
    },
    {
      name: "index.html",
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React + Vite</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      language: "html",
      isFolder: false,
      parentId: null,
    },
    {
      name: "src",
      path: "src",
      content: "",
      language: "",
      isFolder: true,
      parentId: null,
    },
    {
      name: "main.tsx",
      path: "src/main.tsx",
      content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,
      language: "typescript",
      isFolder: false,
      parentId: null,
    },
    {
      name: "App.tsx",
      path: "src/App.tsx",
      content: `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
      <h1>React + Vite Application</h1>
      <p>Edit <code>src/App.tsx</code> to start building.</p>
      <div style={{ marginTop: "1.5rem" }}>
        <button
          onClick={() => setCount((c) => c + 1)}
          style={{ padding: "0.6rem 1.2rem", borderRadius: "8px", border: "none", background: "#6c5ce7", color: "#fff", cursor: "pointer", fontWeight: 600 }}
        >
          Count is {count}
        </button>
      </div>
    </div>
  );
}
`,
      language: "typescript",
      isFolder: false,
      parentId: null,
    },
    {
      name: "index.css",
      path: "src/index.css",
      content: `* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { background: #fafafc; color: #171717; min-height: 100vh; }\n`,
      language: "css",
      isFolder: false,
      parentId: null,
    },
  ];

  return {
    files,
    activeFileId: "src/App.tsx",
    openFileIds: ["src/App.tsx", "package.json"],
  };
}

export function generateNodeExpressFiles(): {
  files: Omit<ProjectFile, "id" | "projectId">[];
  activeFileId: string | null;
  openFileIds: string[];
} {
  const files: Omit<ProjectFile, "id" | "projectId">[] = [
    {
      name: "package.json",
      path: "package.json",
      content: JSON.stringify(
        {
          name: "node-express-api",
          version: "1.0.0",
          main: "server.js",
          scripts: {
            start: "node server.js",
            dev: "nodemon server.js",
          },
          dependencies: {
            express: "^4.21.2",
            cors: "^2.8.5",
          },
        },
        null,
        2
      ),
      language: "json",
      isFolder: false,
      parentId: null,
    },
    {
      name: "server.js",
      path: "server.js",
      content: `const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/api/users", (req, res) => {
  res.json([
    { id: 1, name: "Ada Lovelace", role: "Mathematician" },
    { id: 2, name: "Alan Turing", role: "Computer Scientist" },
  ]);
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});
`,
      language: "javascript",
      isFolder: false,
      parentId: null,
    },
    {
      name: "README.md",
      path: "README.md",
      content: `# Node.js Express API\n\nRun with:\n\`\`\`bash\nnode server.js\n\`\`\`\n`,
      language: "markdown",
      isFolder: false,
      parentId: null,
    },
  ];

  return {
    files,
    activeFileId: "server.js",
    openFileIds: ["server.js", "package.json"],
  };
}

export function generatePythonFiles(): {
  files: Omit<ProjectFile, "id" | "projectId">[];
  activeFileId: string | null;
  openFileIds: string[];
} {
  const files: Omit<ProjectFile, "id" | "projectId">[] = [
    {
      name: "main.py",
      path: "main.py",
      content: `from datetime import datetime

def main():
    print("Python 3 Cloud Environment Active")
    print(f"Current UTC time: {datetime.utcnow().isoformat()}Z")

if __name__ == "__main__":
    main()
`,
      language: "python",
      isFolder: false,
      parentId: null,
    },
    {
      name: "requirements.txt",
      path: "requirements.txt",
      content: `requests>=2.31.0\npytest>=8.0.0\n`,
      language: "plaintext",
      isFolder: false,
      parentId: null,
    },
    {
      name: "README.md",
      path: "README.md",
      content: `# Python Project\n\nRun script:\n\`\`\`bash\npython main.py\n\`\`\`\n`,
      language: "markdown",
      isFolder: false,
      parentId: null,
    },
  ];

  return {
    files,
    activeFileId: "main.py",
    openFileIds: ["main.py", "requirements.txt"],
  };
}

export function getFilesForFrameworkInit(options: FrameworkInitOptions): {
  files: Omit<ProjectFile, "id" | "projectId">[];
  activeFileId: string | null;
  openFileIds: string[];
} {
  switch (options.type) {
    case "nextjs":
      return generateNextJsProjectFiles(options.nextConfig);
    case "react-vite":
      return generateReactViteFiles();
    case "nodejs":
      return generateNodeExpressFiles();
    case "python":
      return generatePythonFiles();
    case "html-web":
      return generateBasicWebFiles(false);
    default:
      return generateBasicWebFiles(false);
  }
}

