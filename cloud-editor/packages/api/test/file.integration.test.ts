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
  files: typeof import("../src/services/file.service.js");
  storage: typeof import("../src/storage/s3.client.js");
  errors: typeof import("../src/utils/errors.js");
};

let services: Services | null = null;

if (hasTestDatabase) {
  services = {
    pool: (await import("../src/db/pool.js")).pool,
    files: await import("../src/services/file.service.js"),
    storage: await import("../src/storage/s3.client.js"),
    errors: await import("../src/utils/errors.js")
  };
}

after(async () => {
  if (services !== null) {
    await services.pool.end();
  }
});

test(
  "file metadata, content, tree, rename, and delete lifecycle",
  { skip: hasTestDatabase ? false : "TEST_DATABASE_URL is not set" },
  async (t) => {
    if (services === null) {
      assert.fail("Test database is not configured");
      return;
    }

    const { pool, files, storage, errors } = services;
    const objects = new Map<string, Buffer>();
    const originalPutObject = storage.s3Storage.putObject;
    const originalGetObjectBuffer = storage.s3Storage.getObjectBuffer;
    const originalDeleteObject = storage.s3Storage.deleteObject;
    const originalDeleteObjects = storage.s3Storage.deleteObjects;

    storage.s3Storage.putObject = (async (key, body) => {
      objects.set(key, Buffer.from(body));
    }) as typeof storage.s3Storage.putObject;
    storage.s3Storage.getObjectBuffer = (async (key) => {
      const content = objects.get(key);

      if (content === undefined) {
        throw new Error(`Missing test S3 object ${key}`);
      }

      return Buffer.from(content);
    }) as typeof storage.s3Storage.getObjectBuffer;
    storage.s3Storage.deleteObject = (async (key) => {
      objects.delete(key);
    }) as typeof storage.s3Storage.deleteObject;
    storage.s3Storage.deleteObjects = (async (keys) => {
      for (const key of keys) {
        objects.delete(key);
      }
    }) as typeof storage.s3Storage.deleteObjects;

    t.after(() => {
      storage.s3Storage.putObject = originalPutObject;
      storage.s3Storage.getObjectBuffer = originalGetObjectBuffer;
      storage.s3Storage.deleteObject = originalDeleteObject;
      storage.s3Storage.deleteObjects = originalDeleteObjects;
    });

    const ownerId = randomUUID();
    const projectId = randomUUID();

    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)`,
      [
        ownerId,
        `file-owner-${ownerId}@example.com`,
        "$argon2id$v=19$m=19456,p=1,t=2$sZlDCnJza0D1d73wGTstmw$U4KAC0JDwPEDlfCIZa48sOvAlfRprDPNr1IW86A1Nfc",
        "File Test Owner"
      ]
    );
    await pool.query(
      `INSERT INTO projects (id, owner_id, name)
       VALUES ($1, $2, $3)`,
      [projectId, ownerId, "File Test Project"]
    );

    try {
      const directory = await files.createFile({
        projectId,
        userId: ownerId,
        path: "src",
        isDir: true
      });
      const indexFile = await files.createFile({
        projectId,
        userId: ownerId,
        path: "src/index.ts",
        isDir: false
      });
      const utilFile = await files.createFile({
        projectId,
        userId: ownerId,
        path: "src/util.ts",
        isDir: false
      });

      assert.equal(directory.isDir, true);
      assert.equal(indexFile.isDir, false);
      assert.equal(indexFile.sizeBytes, 0);
      assert.equal(objects.size, 2);

      const content = Buffer.from("export const answer = 42;\n");
      const written = await files.writeFile({
        fileId: indexFile.id,
        projectId,
        userId: ownerId,
        content
      });

      assert.equal(written.sizeBytes, content.length);
      assert.equal(written.contentHash, files.sha256Hex(content));

      const read = await files.readFile(indexFile.id, projectId);
      assert.equal(read.content.toString(), content.toString());

      await assert.rejects(
        () => files.readFile(indexFile.id, randomUUID()),
        (error: unknown) =>
          error instanceof errors.AppError && error.code === "NOT_FOUND"
      );

      const tree = await files.listTree(projectId);
      assert.equal(tree.length, 1);
      assert.equal(tree[0]?.path, "src");
      assert.equal(tree[0]?.children?.length, 2);

      const renamedFile = await files.renameFile({
        fileId: indexFile.id,
        projectId,
        userId: ownerId,
        newPath: "src/main.ts"
      });
      assert.equal(renamedFile.path, "src/main.ts");
      assert.equal(renamedFile.s3Key, indexFile.s3Key);

      const renamedDirectory = await files.renameFile({
        fileId: directory.id,
        projectId,
        userId: ownerId,
        newPath: "lib"
      });
      assert.equal(renamedDirectory.path, "lib");

      const movedTree = await files.listTree(projectId);
      const movedDirectory = movedTree[0];
      assert.equal(movedDirectory?.path, "lib");
      assert.deepEqual(
        movedDirectory?.children?.map((child) => child.path).sort(),
        ["lib/main.ts", "lib/util.ts"]
      );

      const hydrated = await files.readMany(projectId, [indexFile.id, utilFile.id]);
      assert.equal(hydrated["lib/main.ts"]?.toString(), content.toString());
      assert.equal(hydrated["lib/util.ts"]?.toString(), "");

      await files.deleteFile({ fileId: directory.id, projectId });

      assert.equal(objects.size, 0);
      assert.deepEqual(await files.listTree(projectId), []);
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [ownerId]);
    }
  }
);
