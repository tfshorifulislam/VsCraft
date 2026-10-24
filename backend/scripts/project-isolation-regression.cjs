const { PrismaClient } = require("@prisma/client");

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const prisma = new PrismaClient();

let assertions = 0;
const createdUsers = [];
const createdProjects = [];

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

async function signup(label) {
  const email = `isolation-${label}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}@example.test`;
  const res = await fetch(API_BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TempPass123!",
      name: `Isolation ${label}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Signup failed for ${label}: ${res.status} ${JSON.stringify(data)}`);
  }

  const cookie = (res.headers.getSetCookie() || [])
    .map((value) => value.split(";")[0])
    .join("; ");
  assert(Boolean(cookie), `${label} signup sets an auth cookie`);

  const session = { email, cookie, projects: [] };
  createdUsers.push(session);
  return session;
}

async function list(session) {
  const { res, data } = await api(session, "GET", "/api/projects?category=all");
  assert(res.status === 200, `${session.email} can list projects`);
  assert(Array.isArray(data.projects), `${session.email} receives a projects array`);
  return data.projects;
}

async function createProject(session, name) {
  const { res, data } = await api(session, "POST", "/api/projects", {
    template: "blank",
    name,
    description: "Isolation regression fixture",
  });
  assert(res.status === 201, `${session.email} can create a project`);
  assert(data.project?.id, "Created project includes an id");
  session.projects.push(data.project.id);
  createdProjects.push({ owner: session, id: data.project.id });
  return data.project;
}

async function verifyIsolation() {
  const userA = await signup("a");
  const userB = await signup("b");

  const aInitial = await list(userA);
  const bInitial = await list(userB);
  assert(aInitial.length === 0, "new user A starts with zero projects");
  assert(bInitial.length === 0, "new user B starts with zero projects");

  const projectA = await createProject(userA, "Account A Project");
  const aAfterCreate = await list(userA);
  assert(aAfterCreate.length === 1, "creating one project adds exactly one project for user A");
  assert(aAfterCreate[0].id === projectA.id, "user A receives their created project");

  const bAfterACreate = await list(userB);
  assert(bAfterACreate.length === 0, "user B never sees user A's created project");

  const { res: getRes } = await api(userB, "GET", `/api/projects/${projectA.id}`);
  assert(getRes.status === 404, "user B cannot read user A's project");

  const { res: patchRes } = await api(userB, "PATCH", `/api/projects/${projectA.id}`, {
    name: "Hijacked",
  });
  assert(patchRes.status === 404, "user B cannot modify user A's project");

  const { res: deleteRes } = await api(
    userB,
    "DELETE",
    `/api/projects/${projectA.id}?permanent=true`
  );
  assert(deleteRes.status === 404, "user B cannot delete user A's project");

  const aStillOwnsProject = await list(userA);
  assert(aStillOwnsProject.length === 1, "user A's project survives user B's requests");

  const importRes = await api(userB, "POST", "/api/projects/import", {
    name: "Account B Import",
    files: [{ path: "README.md", content: "# Account B\n", isFolder: false }],
  });
  assert(importRes.res.status === 200, "user B can import a project");
  const importedId = importRes.data.project?.id;
  assert(Boolean(importedId), "Import response includes the project id");
  userB.projects.push(importedId);
  createdProjects.push({ owner: userB, id: importedId });

  const bAfterImport = await list(userB);
  assert(bAfterImport.length === 1, "imported project belongs to user B");
  assert(bAfterImport[0].id === importedId, "user B sees their imported project");

  const aAfterBImport = await list(userA);
  assert(aAfterBImport.length === 1, "user A does not see user B's imported project");
  assert(aAfterBImport[0].id === projectA.id, "user A still sees only their own project");

  const { res: crossImportRes } = await api(userA, "GET", `/api/projects/${importedId}`);
  assert(crossImportRes.status === 404, "user A cannot read user B's imported project");
}

async function cleanup() {
  for (const { owner, id } of createdProjects.reverse()) {
    try {
      const { res } = await api(owner, "DELETE", `/api/projects/${id}?permanent=true`);
      if (!res.ok && res.status !== 404) {
        console.warn(`Cleanup failed for project ${id}: HTTP ${res.status}`);
      }
    } catch (error) {
      console.warn(`Cleanup failed for project ${id}: ${error.message}`);
    }
  }

  for (const user of createdUsers) {
    try {
      await prisma.user.deleteMany({ where: { email: user.email } });
    } catch (error) {
      console.warn(`Cleanup failed for user ${user.email}: ${error.message}`);
    }
  }
}

async function main() {
  try {
    await verifyIsolation();
    console.log(`Project isolation regression passed (${assertions} assertions).`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
