import { randomBytes, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_SECONDS = 56 * 24 * 60 * 60;
export const RECOVERY_SECONDS = 10 * 60;
// Production Workers caps PBKDF2 at 100,000; local workerd does not.
const ITERATIONS = 100_000;
async function derive(
  value: string,
  salt: Buffer,
  iterations = ITERATIONS,
): Promise<Buffer> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return Buffer.from(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: new Uint8Array(salt),
        iterations,
      },
      material,
      256,
    ),
  );
}
export async function hashCredential(value: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(value, salt);
  return `pbkdf2-sha256$${ITERATIONS}$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyCredential(
  value: string,
  encoded: string | null | undefined,
): Promise<boolean> {
  const fields = (encoded ?? "").split("$");
  const valid =
    fields[0] === "pbkdf2-sha256" &&
    fields.length === 4 &&
    (fields[1] === String(ITERATIONS) || fields[1] === "600000") &&
    /^[0-9a-f]{32}$/.test(fields[2] ?? "") &&
    /^[0-9a-f]{64}$/.test(fields[3] ?? "");
  const salt = valid ? Buffer.from(fields[2], "hex") : Buffer.alloc(16);
  const expected = valid ? Buffer.from(fields[3], "hex") : Buffer.alloc(32);
  // Preserve old hashes where supported; never reinterpret their iteration count.
  const actual = await derive(
    value,
    salt,
    valid ? Number(fields[1]) : ITERATIONS,
  );
  return timingSafeEqual(actual, expected) && valid;
}
function signingKey(secret: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(secret ?? ""))
    throw new Error("Signing key is not configured.");
  return new TextEncoder().encode(secret);
}
export async function signToken(
  secret: string,
  subject: string,
  id: string,
  purpose: "session" | "recovery",
  seconds: number,
): Promise<string> {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("zahari")
    .setAudience("zahari:web")
    .setSubject(subject)
    .setJti(id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .sign(signingKey(secret));
}
export async function verifyToken(
  secret: string,
  token: string,
  purpose: "session" | "recovery",
) {
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), {
      algorithms: ["HS256"],
      issuer: "zahari",
      audience: "zahari:web",
    });
    if (
      payload.purpose !== purpose ||
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.exp !== "number"
    )
      return null;
    return { userId: payload.sub, id: payload.jti, expiresAt: payload.exp };
  } catch {
    return null;
  }
}
