const { PrismaClient } = require("@prisma/client");

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const prisma = new PrismaClient();

let assertions = 0;
let user1 = null;
let user2 = null;
let testProjectId = null;

function assert(condition, message) {
  assertions++;
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function api(user, method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(user?.cookie ? { Cookie: user.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }
  return { res, data };
}

async function createTestUser(tag) {
  const email = `e2e-${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@test.com`;
  const res = await fetch(API_BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      name: `User ${tag}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Signup failed for ${tag}: ${res.status} ${JSON.stringify(data)}`);
  }

  const cookie = (res.headers.getSetCookie() || [])
    .map((v) => v.split(";")[0])
    .join("; ");
  return { email, id: data.user?.id, cookie };
}

async function run() {
  console.log("=== Starting Terminal Project Creation & WebContainer Sync E2E Test ===");

  try {
    // 1. Create two authenticated users
    user1 = await createTestUser("owner");
    assert(Boolean(user1.cookie), "User 1 signed up and received auth session cookie");
    user2 = await createTestUser("attacker");
    assert(Boolean(user2.cookie), "User 2 signed up and received auth session cookie");

    // 2. User 1 creates a new project (Terminal Project Creation Flow)
    const createRes = await api(user1, "POST", "/api/projects", {
      type: "blank",
      blankSubtype: "empty",
      name: "My Vite WebContainer App",
      description: "Terminal-based project created with WebContainer runtime",
    });
    assert(createRes.res.status === 201, "Project created successfully via POST /api/projects");
    testProjectId = createRes.data.project.id;
    assert(Boolean(testProjectId), `Project ID assigned: ${testProjectId}`);

    // 3. Security: Unauthorized access prevention
    const unauthorizedGet = await api(user2, "GET", `/api/projects/${testProjectId}`);
    assert(
      unauthorizedGet.res.status === 404,
      "Unauthorized user cannot access project (enforces project isolation)"
    );

    const unauthorizedSync = await api(user2, "POST", `/api/projects/${testProjectId}/sync`, {
      files: [{ path: "hacked.txt", name: "hacked.txt", content: "evil", isFolder: false }],
    });
    assert(
      unauthorizedSync.res.status === 404,
      "Unauthorized user cannot sync or modify files on another user's project"
    );

    // 4. Verify Backend Host Execution is strictly disabled
    const serverExecAttempt = await api(user1, "POST", `/api/projects/${testProjectId}/server`);
    assert(
      serverExecAttempt.res.status === 403,
      "Backend server execution endpoint returns 403 (execution strictly delegated to browser WebContainers)"
    );

    // 5. Simulate WebContainer Scaffolding: `npm create vite@latest . -- --template react-ts`
    console.log("\n--- Testing WebContainer FS Scaffolding & Sync ---");
    const scaffoldedFiles = [
      {
        path: "package.json",
        name: "package.json",
        content: JSON.stringify(
          {
            name: "my-vite-app",
            private: true,
            version: "0.0.0",
            type: "module",
            scripts: { dev: "vite", build: "tsc -b && vite build" },
            dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
            devDependencies: { vite: "^6.0.0", typescript: "~5.7.2" },
          },
          null,
          2
        ),
        isFolder: false,
        language: "json",
      },
      {
        path: "index.html",
        name: "index.html",
        content: `<!doctype html><html lang="en"><head><title>Vite App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
        isFolder: false,
        language: "html",
      },
      {
        path: "vite.config.ts",
        name: "vite.config.ts",
        content: `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()] });`,
        isFolder: false,
        language: "typescript",
      },
      {
        path: "src",
        name: "src",
        content: "",
        isFolder: true,
        language: "",
      },
      {
        path: "src/main.tsx",
        name: "main.tsx",
        content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);`,
        isFolder: false,
        language: "typescript",
      },
      {
        path: "src/App.tsx",
        name: "App.tsx",
        content: `import React, { useState } from 'react';\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return <div className="app"><h1>Vite + WebContainer</h1><button onClick={() => setCount(c => c + 1)}>Count: {count}</button></div>;\n}`,
        isFolder: false,
        language: "typescript",
      },
      {
        path: "src/App.css",
        name: "App.css",
        content: `.app { padding: 2rem; font-family: sans-serif; text-align: center; }`,
        isFolder: false,
        language: "css",
      },
    ];

    const syncRes = await api(user1, "POST", `/api/projects/${testProjectId}/sync`, {
      files: scaffoldedFiles,
    });
    assert(syncRes.res.status === 200, "POST /api/projects/:id/sync succeeded with status 200");
    assert(syncRes.data.success === true, "Sync response indicated success: true");
    assert(
      Array.isArray(syncRes.data.files) && syncRes.data.files.length >= scaffoldedFiles.length,
      `All ${scaffoldedFiles.length} scaffolded files returned with persistent IDs`
    );

    // 6. Direct Database Verification
    console.log("\n--- Verifying SQLite Database State via Prisma ---");
    const dbFiles = await prisma.projectFile.findMany({
      where: { projectId: testProjectId },
    });
    assert(dbFiles.length === scaffoldedFiles.length, `Database contains exactly ${dbFiles.length} files`);

    const srcDir = dbFiles.find((f) => f.path === "src" && f.isFolder);
    assert(Boolean(srcDir), "Directory 'src' persisted with isFolder: true");

    const appTsx = dbFiles.find((f) => f.path === "src/App.tsx");
    assert(Boolean(appTsx), "'src/App.tsx' persisted in database");
    assert(appTsx.parentId === srcDir.id, "'src/App.tsx' correctly linked to parent folder 'src'");
    assert(appTsx.content.includes("Vite + WebContainer"), "File content stored correctly");

    // 7. Monaco Editor Modification & Live Synchronize Flow
    console.log("\n--- Testing Monaco Editor File Edit & Live Sync ---");
    const updatedAppTsxContent = `import React from 'react';\nexport default function App() {\n  return <h1>Updated live inside Monaco Editor!</h1>;\n}`;
    const modifiedFiles = scaffoldedFiles.map((f) =>
      f.path === "src/App.tsx" ? { ...f, content: updatedAppTsxContent } : f
    );

    const updateSync = await api(user1, "POST", `/api/projects/${testProjectId}/sync`, {
      files: modifiedFiles,
    });
    assert(updateSync.res.status === 200, "Live update sync returned 200");

    const reloadedAppTsx = await prisma.projectFile.findFirst({
      where: { projectId: testProjectId, path: "src/App.tsx" },
    });
    assert(
      reloadedAppTsx.content === updatedAppTsxContent,
      "Database reflects updated content from editor edit"
    );
    assert(reloadedAppTsx.version > appTsx.version, "File version incremented on edit");

    // 8. Path Traversal & Sanitization Security Test
    console.log("\n--- Testing Path Traversal Defenses ---");
    const unsafeSync = await api(user1, "POST", `/api/projects/${testProjectId}/sync`, {
      files: [
        ...modifiedFiles,
        {
          path: "../../../escaped.txt",
          name: "escaped.txt",
          content: "malicious",
          isFolder: false,
        },
      ],
    });
    assert(unsafeSync.res.status === 200, "Sync with traversal was handled gracefully");
    const escapedFile = await prisma.projectFile.findFirst({
      where: { projectId: testProjectId, path: { contains: "escaped" } },
    });
    assert(!escapedFile, "Directory traversal path was rejected/sanitized and not saved");

    console.log(`\n🎉 All ${assertions} E2E assertions PASSED successfully!`);
  } finally {
    // Cleanup
    if (testProjectId) {
      await prisma.projectFile.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.project.deleteMany({ where: { id: testProjectId } }).catch(() => {});
    }
    if (user1?.id) {
      await prisma.user.deleteMany({ where: { id: user1.id } }).catch(() => {});
    }
    if (user2?.id) {
      await prisma.user.deleteMany({ where: { id: user2.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

