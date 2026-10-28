import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase =
  typeof testDatabaseUrl === "string" && testDatabaseUrl.length > 0;

process.env.NODE_ENV = "test";
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789abcdef";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-0123456789abcdef";
process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
process.env.S3_REGION = "us-east-1";
process.env.S3_BUCKET = "cloud-editor-test";
process.env.S3_ACCESS_KEY = "test-access-key";
process.env.S3_SECRET_KEY = "test-secret-key";
process.env.S3_FORCE_PATH_STYLE = "true";
process.env.CORS_ORIGIN = "http://localhost:3000";

if (hasTestDatabase) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

type Services = {
  pool: (typeof import("../src/db/pool.js"))["pool"];
  project: typeof import("../src/services/project.service.js");
  errors: typeof import("../src/utils/errors.js");
};

let services: Services | null = null;

if (hasTestDatabase) {
  services = {
    pool: (await import("../src/db/pool.js")).pool,
    project: await import("../src/services/project.service.js"),
    errors: await import("../src/utils/errors.js")
  };
}

after(async () => {
  if (services !== null) {
    await services.pool.end();
  }
});

const createUser = async (label: string): Promise<{ id: string; email: string }> => {
  if (services === null) {
    throw new Error("Test database is not configured");
  }

  const id = randomUUID();
  const email = `${label}-${id}@example.com`;

  await services.pool.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES ($1, $2, $3, $4)`,
    [
      id,
      email,
      "$argon2id$v=19$m=19456,p=1,t=2$sZlDCnJza0D1d73wGTstmw$U4KAC0JDwPEDlfCIZa48sOvAlfRprDPNr1IW86A1Nfc",
      "Project Test User"
    ]
  );

  return { id, email };
};

test(
  "project lifecycle, membership, and owner protection",
  { skip: hasTestDatabase ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    if (services === null) {
      assert.fail("Test database is not configured");
      return;
    }

    const { pool, project, errors } = services;
    const owner = await createUser("project-owner");
    const editor = await createUser("project-editor");

    try {
      const created = await project.createProject(owner.id, {
        name: "Test Project",
        description: "Prompt 4 project test",
        language: "typescript"
      });

      assert.equal(created.role, "owner");
      assert.equal(created.ownerId, owner.id);
      assert.equal(created.name, "Test Project");

      const listed = await project.listMyProjects(owner.id);
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, created.id);
      assert.equal(listed[0]?.memberCount, 1);

      const fetched = await project.getProjectWithRole(created.id, owner.id);
      assert.equal(fetched.id, created.id);
      assert.equal(fetched.role, "owner");

      const updated = await project.updateProject(created.id, {
        name: "Renamed Project",
        visibility: "public"
      });
      assert.equal(updated.name, "Renamed Project");
      assert.equal(updated.visibility, "public");

      const added = await project.addMember(created.id, {
        email: editor.email,
        role: "editor"
      });
      assert.equal(added.userId, editor.id);
      assert.equal(added.role, "editor");

      const members = await project.listMembers(created.id);
      assert.equal(members.length, 2);
      assert.equal(members[0]?.role, "owner");
      assert.equal(members[1]?.role, "editor");

      const promoted = await project.updateMemberRole(created.id, editor.id, "viewer");
      assert.equal(promoted.role, "viewer");

      await assert.rejects(
        () => project.updateMemberRole(created.id, owner.id, "editor"),
        (error: unknown) =>
          error instanceof errors.AppError &&
          error.message === "cannot_change_owner_role"
      );

      await project.removeMember(created.id, editor.id);

      await assert.rejects(
        () => project.removeMember(created.id, owner.id),
        (error: unknown) =>
          error instanceof errors.AppError &&
          error.message === "cannot_remove_owner"
      );

      await project.deleteProject(created.id);

      await assert.rejects(
        () => project.getProject(created.id),
        (error: unknown) =>
          error instanceof errors.AppError && error.code === "NOT_FOUND"
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        [owner.id, editor.id]
      ]);
    }
  }
);
