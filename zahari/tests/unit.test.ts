import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import {
  hashCredential,
  verifyCredential,
  signToken,
  verifyToken,
  SESSION_SECONDS,
} from "../src/lib/crypto";
import {
  normalizeUsername,
  validUsername,
  validPassword,
  validPasscode,
} from "../src/lib/validation";

test("username normalization and credential rules", () => {
  assert.equal(normalizeUsername("  Alice_17 "), "alice_17");
  for (const value of ["abc", "alice_17"])
    assert.equal(validUsername(value), true);
  for (const value of ["ab", "a space", "A".repeat(25)])
    assert.equal(validUsername(value), false);
  for (const value of ["abcdef1", "abcdefghijklmno123"])
    assert.equal(validPassword(value), true);
  for (const value of [
    "abc123",
    "onlyletters",
    "12345678",
    "a".repeat(19) + "1",
  ])
    assert.equal(validPassword(value), false);
  assert.equal(validPasscode("a1b2c3d4"), true);
  for (const value of ["a1B2c3d4", "1234567", "123456789", "a1b2c3d!"])
    assert.equal(validPasscode(value), false);
});
test("credentials use distinct salts and verify correctly", async () => {
  const [first, second] = await Promise.all([
    hashCredential("example123"),
    hashCredential("example123"),
  ]);
  assert.notEqual(first, second);
  assert.match(first, /^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(await verifyCredential("example123", first), true);
  assert.equal(await verifyCredential("wrong123", first), false);
  assert.equal(await verifyCredential("wrong123", undefined), false);
});
test("Web Crypto matches standard PBKDF2 and retains legacy verification", async () => {
  const current = await hashCredential("example123");
  const [, iterations, salt, key] = current.split("$");
  assert.equal(
    pbkdf2Sync(
      "example123",
      Buffer.from(salt, "hex"),
      Number(iterations),
      32,
      "sha256",
    ).toString("hex"),
    key,
  );
  const legacyKey = pbkdf2Sync(
    "example123",
    Buffer.from(salt, "hex"),
    600000,
    32,
    "sha256",
  ).toString("hex");
  assert.equal(
    await verifyCredential(
      "example123",
      `pbkdf2-sha256$600000$${salt}$${legacyKey}`,
    ),
    true,
  );
  assert.equal(await verifyCredential("example123", current + "$extra"), false);
});
test("56-day tokens enforce signature, expiry and purpose", async () => {
  const secret = randomBytes(32).toString("hex");
  assert.equal(SESSION_SECONDS, 4_838_400);
  const token = await signToken(
    secret,
    "user",
    "session",
    "session",
    SESSION_SECONDS,
  );
  const result = await verifyToken(secret, token, "session");
  assert.equal(result?.userId, "user");
  assert.ok(
    Math.abs(
      result!.expiresAt - Math.floor(Date.now() / 1000) - SESSION_SECONDS,
    ) <= 1,
  );
  assert.equal(await verifyToken(secret, token, "recovery"), null);
  assert.equal(
    await verifyToken(randomBytes(32).toString("hex"), token, "session"),
    null,
  );
  assert.equal(await verifyToken(secret, token + "tampered", "session"), null);
  const expired = await signToken(secret, "user", "old", "session", -1);
  assert.equal(await verifyToken(secret, expired, "session"), null);
});
