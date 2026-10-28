import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/cloud_editor_test";
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

const dbModule = await import("../src/db/pool.js");
const storageModule = await import("../src/storage/s3.client.js");
const errorsModule = await import("../src/utils/errors.js");
const service = await import("../src/services/file.service.js");

after(async () => {
  await dbModule.pool.end();
});

test("normalizePath produces canonical metadata paths", () => {
  assert.equal(service.normalizePath("src//index.ts"), "src/index.ts");
  assert.equal(service.normalizePath("/src/index.ts"), "src/index.ts");
  assert.equal(service.normalizePath("src/", true), "src");
  assert.equal(service.pathParent("src/lib/util.ts"), "src/lib");
  assert.equal(service.pathParent("README.md"), "");
});

test("normalizePath rejects traversal, backslashes, and file trailing slashes", () => {
  for (const path of ["../secret", "src/../../etc/passwd", "src\\index.ts", "", "/"]) {
    assert.throws(
      () => service.normalizePath(path),
      (error: unknown) => error instanceof errorsModule.AppError && error.code === "BAD_REQUEST"
    );
  }

  assert.throws(
    () => service.normalizePath("src/"),
    (error: unknown) => error instanceof errorsModule.AppError && error.code === "BAD_REQUEST"
  );
});

test("assertNoConflict rejects an existing file ancestor", async () => {
  const projectId = randomUUID();
  const db = {
    query: async () => ({
      rows: [{ path: "src", is_dir: false }]
    })
  } as unknown as typeof dbModule.pool;

  await assert.rejects(
    () => service.assertNoConflict(db, projectId, "src/index.ts"),
    (error: unknown) => error instanceof errorsModule.AppError && error.code === "CONFLICT"
  );
});

test("writeFile skips S3 and refreshes metadata when the hash is unchanged", async (t) => {
  const projectId = randomUUID();
  const fileId = randomUUID();
  const userId = randomUUID();
  const content = Buffer.from("const value = 1;\n");
  const contentHash = service.sha256Hex(content);
  const s3Key = storageModule.fileContentKey(projectId, fileId);
  const now = new Date();
  const row = {
    id: fileId,
    project_id: projectId,
    path: "src/index.ts",
    is_dir: false,
    size_bytes: content.length,
    s3_key: s3Key,
    content_hash: contentHash,
    updated_by: userId,
    created_at: now,
    updated_at: now
  };

  const originalQuery = dbModule.pool.query;
  let putCallCount = 0;

  dbModule.pool.query = (async () => ({
    rows: [{ ...row, updated_at: new Date() }],
    rowCount: 1,
    command: "UPDATE",
    oid: 0,
    fields: []
  })) as typeof dbModule.pool.query;

  const originalPutObject = storageModule.s3Storage.putObject;
  storageModule.s3Storage.putObject = (async () => {
    putCallCount += 1;
  }) as typeof storageModule.s3Storage.putObject;

  t.after(() => {
    dbModule.pool.query = originalQuery;
    storageModule.s3Storage.putObject = originalPutObject;
  });

  const written = await service.writeFile({
    fileId,
    projectId,
    userId,
    content
  });

  assert.equal(written.contentHash, contentHash);
  assert.equal(written.sizeBytes, content.length);
  assert.equal(putCallCount, 0);
});

test("writeFile rejects content larger than MAX_FILE_SIZE_MB", async () => {
  await assert.rejects(
    () =>
      service.writeFile({
        fileId: randomUUID(),
        projectId: randomUUID(),
        userId: randomUUID(),
        content: Buffer.alloc(service.MAX_FILE_SIZE_BYTES + 1)
      }),
    (error: unknown) =>
      error instanceof errorsModule.AppError &&
      error.code === "BAD_REQUEST" &&
      error.message === "file_too_large"
  );
});
