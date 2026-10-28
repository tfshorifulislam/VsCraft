import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

type PoolInstance = (typeof import("../src/db/pool.js"))["pool"];
type TokenModule = typeof import("../src/services/token.service.js");
type RbacModule = typeof import("../src/middlewares/rbac.middleware.js");
type ErrorsModule = typeof import("../src/utils/errors.js");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase =
  typeof testDatabaseUrl === "string" && testDatabaseUrl.length > 0;

process.env.NODE_ENV = "test";
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789abcdef";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-0123456789abcdef";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";
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

let services: {
  pool: PoolInstance;
  token: TokenModule;
  rbac: RbacModule;
  errors: ErrorsModule;
} | null = null;

if (hasTestDatabase) {
  const poolModule = await import("../src/db/pool.js");
  services = {
    pool: poolModule.pool,
    token: await import("../src/services/token.service.js"),
    rbac: await import("../src/middlewares/rbac.middleware.js"),
    errors: await import("../src/utils/errors.js")
  };
}

after(async () => {
  if (services !== null) {
    await services.pool.end();
  }
});

const createUser = async (label: string): Promise<string> => {
  if (services === null) {
    throw new Error("Test database is not configured");
  }

  const id = randomUUID();

  await services.pool.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES ($1, $2, $3, $4)`,
    [
      id,
      `${label}-${id}@example.com`,
      "$argon2id$v=19$m=19456,p=1,t=2$sZlDCnJza0D1d73wGTstmw$U4KAC0JDwPEDlfCIZa48sOvAlfRprDPNr1IW86A1Nfc",
      "Test User"
    ]
  );

  return id;
};

const invokeMiddleware = (
  middleware: RequestHandler,
  req: Request
): Promise<unknown> =>
  new Promise((resolve) => {
    middleware(req, {} as Response, ((error?: unknown) => resolve(error)) as NextFunction);
  });

const makeRequest = (userId: string, projectId: string): Request =>
  ({
    user: {
      id: userId,
      email: `${userId}@example.com`
    },
    params: {
      projectId
    }
  }) as unknown as Request;

test(
  "refresh rotation rejects old tokens and reuse revokes all sessions",
  { skip: hasTestDatabase ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    if (services === null) {
      assert.fail("Test database is not configured");
      return;
    }

    const { pool, token, errors } = services;
    const userId = await createUser("refresh");

    try {
      const first = await token.createRefreshToken(userId, {
        userAgent: "node-test",
        ip: "127.0.0.1"
      });
      const second = await token.rotateRefreshToken(first.raw, {
        userAgent: "node-test",
        ip: "127.0.0.1"
      });

      assert.notEqual(first.raw, second.raw);
      assert.equal(second.userId, userId);

      await assert.rejects(
        () => token.rotateRefreshToken(first.raw),
        (error: unknown) => error instanceof errors.AppError && error.code === "refresh_reuse"
      );

      await assert.rejects(
        () => token.rotateRefreshToken(second.raw),
        (error: unknown) => error instanceof errors.AppError && error.code === "refresh_reuse"
      );

      const active = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM refresh_tokens
         WHERE user_id = $1
           AND revoked_at IS NULL`,
        [userId]
      );

      assert.equal(active.rows[0]?.count, 0);
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  }
);

test(
  "requireEditor allows owner and editor but forbids viewer and stranger",
  { skip: hasTestDatabase ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    if (services === null) {
      assert.fail("Test database is not configured");
      return;
    }

    const { pool, rbac, errors } = services;
    const ownerId = await createUser("rbac-owner");
    const editorId = await createUser("rbac-editor");
    const viewerId = await createUser("rbac-viewer");
    const strangerId = await createUser("rbac-stranger");
    const projectId = randomUUID();

    const assertAllowed = async (userId: string, expectedRole: string): Promise<void> => {
      const req = makeRequest(userId, projectId);
      const error = await invokeMiddleware(rbac.requireEditor, req);

      assert.equal(error, undefined);
      assert.equal(req.projectRole, expectedRole);
    };

    const assertDenied = async (userId: string): Promise<void> => {
      const req = makeRequest(userId, projectId);
      const error = await invokeMiddleware(rbac.requireEditor, req);

      assert.ok(error instanceof errors.AppError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "FORBIDDEN");
    };

    try {
      await pool.query(
        `INSERT INTO projects (id, owner_id, name)
         VALUES ($1, $2, $3)`,
        [projectId, ownerId, "rbac-test-project"]
      );
      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'owner'), ($1, $3, 'editor'), ($1, $4, 'viewer')`,
        [projectId, ownerId, editorId, viewerId]
      );

      await assertAllowed(ownerId, "owner");
      await assertAllowed(editorId, "editor");
      await assertDenied(viewerId);
      await assertDenied(strangerId);
    } finally {
      await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        [ownerId, editorId, viewerId, strangerId]
      ]);
    }
  }
);
