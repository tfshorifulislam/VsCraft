import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/cloud_editor_test";
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789abcdef";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-0123456789abcdef";
process.env.JWT_ACCESS_TTL = "1s";
process.env.JWT_REFRESH_TTL = "7d";
process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
process.env.S3_REGION = "us-east-1";
process.env.S3_BUCKET = "cloud-editor-test";
process.env.S3_ACCESS_KEY = "test-access-key";
process.env.S3_SECRET_KEY = "test-secret-key";
process.env.S3_FORCE_PATH_STYLE = "true";
process.env.CORS_ORIGIN = "http://localhost:3000";

const { pool } = await import("../src/db/pool.js");
const { signAccessToken, verifyAccessToken } = await import(
  "../src/services/token.service.js"
);

after(async () => {
  await pool.end();
});

test("access tokens sign, verify, and expire", async () => {
  const userId = randomUUID();
  const token = await signAccessToken({
    sub: userId,
    email: "token-test@example.com"
  });

  const verified = await verifyAccessToken(token);

  assert.equal(verified.sub, userId);
  assert.equal(verified.email, "token-test@example.com");
  assert.match(
    verified.jti,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );

  await assert.rejects(() => verifyAccessToken(`${token}tampered`));

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  await assert.rejects(() => verifyAccessToken(token));
});
