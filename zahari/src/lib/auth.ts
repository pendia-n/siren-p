import type { AstroCookies } from "astro";
import { createHmac } from "node:crypto";
import {
  signToken,
  verifyToken,
  SESSION_SECONDS,
  RECOVERY_SECONDS,
} from "./crypto";

export interface Bindings {
  DB: D1Database;
  MODELS: R2Bucket;
  ZAHARI_JWT_SECRET: string;
}
export interface SessionUser {
  id: string;
  username: string;
  createdAt: number;
  hasPasscode: boolean;
  sessionExpiresAt: number;
}
export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  recovery_hash: string | null;
  credential_version: number;
  created_at: number;
}
export const SESSION_COOKIE = "__Host-zahari_session";
export const RECOVERY_COOKIE = "__Host-zahari_recovery";
export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};
export const now = () => Math.floor(Date.now() / 1000);
export function clearSession(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, cookieOptions);
}
export function clearRecovery(cookies: AstroCookies) {
  cookies.delete(RECOVERY_COOKIE, cookieOptions);
}

export async function newSession(
  bindings: Bindings,
  cookies: AstroCookies,
  user: UserRow,
) {
  const id = crypto.randomUUID();
  const expires = now() + SESSION_SECONDS;
  const token = await signToken(
    bindings.ZAHARI_JWT_SECRET,
    user.id,
    id,
    "session",
    SESSION_SECONDS,
  );
  await bindings.DB.prepare(
    "INSERT INTO sessions(id,user_id,credential_version,created_at,expires_at) VALUES(?,?,?,?,?)",
  )
    .bind(id, user.id, user.credential_version, now(), expires)
    .run();
  cookies.set(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: SESSION_SECONDS,
    expires: new Date(expires * 1000),
  });
  clearRecovery(cookies);
}
export async function session(
  bindings: Bindings,
  cookies: AstroCookies,
): Promise<{ user: SessionUser; id: string } | null> {
  const cookie = cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  const claims = await verifyToken(
    bindings.ZAHARI_JWT_SECRET,
    cookie,
    "session",
  );
  if (!claims) {
    clearSession(cookies);
    return null;
  }
  const row = await bindings.DB.prepare(
    `SELECT u.id, u.username, u.created_at, u.recovery_hash IS NOT NULL AS has_passcode, s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id=? AND s.user_id=? AND s.expires_at>? AND s.credential_version=u.credential_version`,
  )
    .bind(claims.id, claims.userId, now())
    .first<{
      id: string;
      username: string;
      created_at: number;
      has_passcode: number;
      expires_at: number;
    }>();
  if (!row) {
    clearSession(cookies);
    return null;
  }
  return {
    id: claims.id,
    user: {
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      hasPasscode: Boolean(row.has_passcode),
      sessionExpiresAt: row.expires_at,
    },
  };
}
export async function recoveryGrant(
  bindings: Bindings,
  cookies: AstroCookies,
  user: UserRow,
) {
  const id = crypto.randomUUID();
  await bindings.DB.prepare(
    "INSERT INTO recovery_grants(id,user_id,credential_version,expires_at) VALUES(?,?,?,?)",
  )
    .bind(id, user.id, user.credential_version, now() + RECOVERY_SECONDS)
    .run();
  const token = await signToken(
    bindings.ZAHARI_JWT_SECRET,
    user.id,
    id,
    "recovery",
    RECOVERY_SECONDS,
  );
  cookies.set(RECOVERY_COOKIE, token, {
    ...cookieOptions,
    maxAge: RECOVERY_SECONDS,
  });
}
export async function rateLimit(
  bindings: Bindings,
  key: string,
  limit: number,
  seconds: number,
): Promise<boolean> {
  const digest = createHmac("sha256", bindings.ZAHARI_JWT_SECRET)
    .update(`rate:${key}`)
    .digest("hex");
  const timestamp = now();
  const row = await bindings.DB.prepare(
    `INSERT INTO rate_limits(key,started_at,attempts) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN started_at<=? THEN 1 ELSE attempts+1 END,
    started_at=CASE WHEN started_at<=? THEN excluded.started_at ELSE started_at END RETURNING attempts`,
  )
    .bind(digest, timestamp, timestamp - seconds, timestamp - seconds)
    .first<{ attempts: number }>();
  return Boolean(row && row.attempts <= limit);
}
