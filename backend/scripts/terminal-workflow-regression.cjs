const { PrismaClient } = require("@prisma/client");
const WebSocket = require("ws");

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const prisma = new PrismaClient();

let assertions = 0;
let createdUser = null;
let createdProjectId = null;
let socket = null;

function assert(condition, message) {
  assertions++;
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function api(session, method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session?.cookie ? { Cookie: session.cookie } : {}),
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

async function signup() {
  const email = `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const res = await fetch(API_BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TempPass123!",
      name: "Terminal Regression",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Signup failed: ${res.status} ${JSON.stringify(data)}`);
  }

  const cookie = (res.headers.getSetCookie() || [])
    .map((value) => value.split(";")[0])
    .join("; ");
  assert(Boolean(cookie), "signup sets an auth cookie");
  createdUser = { email, cookie };
  return createdUser;
}

function connectTerminal(projectId, sessionId, wsPort) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${wsPort}?projectId=${encodeURIComponent(projectId)}&sessionId=${encodeURIComponent(sessionId)}`,
      { headers: { Cookie: createdUser?.cookie || "" } }
    );
    socket = ws;

    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for terminal output. Received: ${JSON.stringify(output.slice(-500))}`));
    }, 15000);

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "init" && typeof message.buffer === "string") {
          output += message.buffer;
        } else if (message.type === "output" && typeof message.data === "string") {
          output += message.data;
        } else if (message.type === "error") {
          clearTimeout(timeout);
          reject(new Error(`Terminal WebSocket error: ${message.data}`));
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    ws.once("open", () => {
      resolve({
        ws,
        getOutput: () => output,
        stop: () => clearTimeout(timeout),
        send: (data) => ws.send(JSON.stringify(data)),
      });
    });
    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function waitFor(predicate, description, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function cleanup() {
  if (socket) {
    try {
      socket.close();
    } catch {}
  }

  if (createdProjectId && createdUser) {
    try {
      await api(createdUser, "POST", `/api/projects/${createdProjectId}/cleanup`);
      const { res } = await api(
        createdUser,
        "DELETE",
        `/api/projects/${createdProjectId}?permanent=true`
      );
      if (!res.ok && res.status !== 404) {
        console.warn(`Project cleanup failed: HTTP ${res.status}`);
      }
    } catch (error) {
      console.warn(`Project cleanup failed: ${error.message}`);
    }
  }

  if (createdUser) {
    try {
      await prisma.user.deleteMany({ where: { email: createdUser.email } });
    } catch (error) {
      console.warn(`User cleanup failed: ${error.message}`);
    }
  }

  await prisma.$disconnect();
}

async function main() {
  try {
    const session = await signup();

    const start = await api(session, "POST", "/api/projects/terminal-session", {
      name: "Terminal Workflow Regression",
    });
    assert(start.res.status === 200, "terminal session starts successfully");
    assert(
      typeof start.data.projectId === "string" && start.data.projectId.length > 0,
      "terminal session returns a top-level projectId"
    );
    assert(
      typeof start.data.sessionId === "string" && start.data.sessionId.length > 0,
      "terminal session returns a top-level sessionId"
    );
    assert(start.data.projectId !== "undefined", "terminal response does not use the string undefined");
    assert(
      typeof start.data.wsPort === "number" && start.data.wsPort > 0,
      "terminal session returns the WebSocket port"
    );

    createdProjectId = start.data.projectId;
    assert(start.data.project?.id === createdProjectId, "nested project data matches projectId");
    assert(start.data.session?.id === start.data.sessionId, "nested session data matches sessionId");

    const persisted = await prisma.project.findUnique({ where: { id: createdProjectId } });
    assert(Boolean(persisted), "terminal project is persisted before navigation");
    assert(persisted.name === "Terminal Workflow Regression", "terminal project keeps its name");

    const terminal = await connectTerminal(
      start.data.projectId,
      start.data.sessionId,
      start.data.wsPort
    );
    try {
      await waitFor(
        () => /PS \.\.\.\\[^>]*>/.test(terminal.getOutput()),
        "the PowerShell prompt"
      ).catch((error) => {
        throw new Error(
          `${error.message} Terminal output: ${JSON.stringify(terminal.getOutput().slice(-1000))}`
        );
      });
      const prompt = terminal.getOutput();
      assert(!/undefined/i.test(prompt), "terminal prompt never displays undefined");
      assert(
        prompt.includes("Terminal Workflow Regression"),
        "terminal prompt displays the actual project name"
      );

      terminal.send({ type: "input", data: "echo __TERMINAL_REGRESSION_MARKER__\r" });
      await waitFor(
        () => terminal.getOutput().includes("__TERMINAL_REGRESSION_MARKER__"),
        "the command result"
      );

      terminal.send({
        type: "input",
        data: "1..200 | ForEach-Object { \"LINE-$_\" }\r",
      });
      await waitFor(
        () => terminal.getOutput().includes("LINE-200"),
        "multi-line command output"
      );

      terminal.send({ type: "resize", cols: 120, rows: 40 });
      terminal.send({ type: "input", data: "echo __AFTER_RESIZE__\r" });
      await waitFor(
        () => terminal.getOutput().includes("__AFTER_RESIZE__"),
        "output after a terminal resize"
      );
    } finally {
      terminal.stop();
    }

    const finalize = await api(session, "POST", `/api/projects/${createdProjectId}/finalize`, {
      name: "Terminal Workflow Regression",
    });
    assert(finalize.res.status === 200, "finalizing the terminal project succeeds");
    assert(
      finalize.data.projectId === createdProjectId,
      "finalize returns the persisted projectId"
    );
    assert(
      finalize.data.redirectUrl === `/editor/${createdProjectId}`,
      "finalize returns the correct editor redirect"
    );

    const reloaded = await api(session, "GET", `/api/projects/${createdProjectId}`);
    assert(reloaded.res.status === 200, "finalized project can be reloaded");
    assert(reloaded.data.project?.id === createdProjectId, "reloaded project has the same id");

    console.log(`Terminal workflow regression passed (${assertions} assertions).`);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
