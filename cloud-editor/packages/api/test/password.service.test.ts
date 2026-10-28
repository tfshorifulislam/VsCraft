import assert from "node:assert/strict";
import test from "node:test";

const { hashPassword, verifyPassword } = await import(
  "../src/services/password.service.js"
);

test("argon2id password hash roundtrip", async () => {
  const hash = await hashPassword("CorrectHorse123");

  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, "CorrectHorse123"), true);
  assert.equal(await verifyPassword(hash, "WrongHorse123"), false);
});

test("malformed password hashes fail closed", async () => {
  assert.equal(await verifyPassword("not-a-valid-hash", "CorrectHorse123"), false);
});
