import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import {
  clearRecovery,
  clearSession,
  newSession,
  now,
  rateLimit,
  recoveryGrant,
  RECOVERY_COOKIE,
  type UserRow,
} from "../../../lib/auth";
import {
  hashCredential,
  verifyCredential,
  verifyToken,
} from "../../../lib/crypto";
import {
  normalizeUsername,
  validPasscode,
  validPassword,
  validUsername,
  PASSWORD_HELP,
  PASSCODE_HELP,
} from "../../../lib/validation";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status = 400) =>
  reply({ error: message }, status);
const findUser = (username: string) =>
  bindings.DB.prepare("SELECT * FROM users WHERE username=?")
    .bind(username)
    .first<UserRow>();
export const ALL: APIRoute = async (context) => {
  const { request, url, cookies, locals } = context;
  const action = context.params.action ?? "";
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  try {
    if (!bindings.DB || !bindings.ZAHARI_JWT_SECRET)
      return error(
        "Account services are being configured. Please try again later.",
        503,
      );
    if (request.method === "GET") {
      if (action === "session") return reply({ user: locals.user });
      if (action === "availability") {
        if (!(await rateLimit(bindings, `availability:${ip}`, 60, 60)))
          return error("Please wait a moment before checking again.", 429);
        const username = normalizeUsername(url.searchParams.get("username"));
        if (!validUsername(username))
          return error("Use 3–24 letters, numbers or underscores.");
        const exists = await bindings.DB.prepare(
          "SELECT id FROM users WHERE username=?",
        )
          .bind(username)
          .first();
        return reply({ available: !exists });
      }
      return error("This endpoint does not accept GET requests.", 405);
    }
    if (request.method !== "POST") return error("Method not allowed.", 405);
    const origin = request.headers.get("Origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site" ||
      request.headers.get("X-Zahari-Client") !== "web"
    )
      return error("Please submit this request from Zahari.", 403);
    if (
      !request.headers
        .get("Content-Type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return error("Send a JSON request.", 415);
    if (Number(request.headers.get("Content-Length") ?? 0) > 4096)
      return error("The request is too large.", 413);
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return error("The request is too large.", 413);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return error("The request could not be read.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return error("The request could not be read.");
    const username = normalizeUsername(body.username);
    if (
      [
        "register",
        "login",
        "recover/start",
        "recover/verify",
        "recover/complete",
      ].includes(action) &&
      !(await rateLimit(bindings, `auth:${ip}`, 100, 900))
    )
      return error("Too many attempts. Try again in 15 minutes.", 429);
    if (action === "register") {
      if (!(await rateLimit(bindings, `signup:${ip}`, 20, 3600)))
        return error("Please try creating your account again later.", 429);
      if (!validUsername(username))
        return error(
          "Use 3–24 letters, numbers or underscores for your username.",
        );
      if (!validPassword(body.password)) return error(PASSWORD_HELP);
      if (!validPasscode(body.passcode)) return error(PASSCODE_HELP);
      if (body.password === body.passcode)
        return error(
          "Choose a recovery passcode different from your password.",
        );
      const passwordHash = await hashCredential(body.password);
      const recoveryHash = await hashCredential(body.passcode);
      const user: UserRow = {
        id: crypto.randomUUID(),
        username,
        password_hash: passwordHash,
        recovery_hash: recoveryHash,
        credential_version: 0,
        created_at: now(),
      };
      try {
        await bindings.DB.prepare(
          "INSERT INTO users(id,username,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)",
        )
          .bind(user.id, username, passwordHash, recoveryHash, user.created_at)
          .run();
      } catch (failure) {
        if (failure instanceof Error && /UNIQUE/.test(failure.message))
          return error("That username is already taken. Choose another.", 409);
        throw failure;
      }
      await newSession(bindings, cookies, user);
      return reply({ ok: true, redirect: "/studio" }, 201);
    }
    if (action === "login") {
      if (!(await rateLimit(bindings, `login:${username}`, 10, 900)))
        return error("Too many attempts. Try again in 15 minutes.", 429);
      if (
        !validUsername(username) ||
        typeof body.password !== "string" ||
        body.password.length > 128
      )
        return error("Check your username and password.", 401);
      const user = await findUser(username);
      if (
        !(await verifyCredential(body.password, user?.password_hash)) ||
        !user
      )
        return error("Check your username and password.", 401);
      await newSession(bindings, cookies, user);
      return reply({ ok: true, redirect: "/studio" });
    }
    if (action === "logout") {
      if (locals.sessionId)
        await bindings.DB.prepare("DELETE FROM sessions WHERE id=?")
          .bind(locals.sessionId)
          .run();
      clearSession(cookies);
      clearRecovery(cookies);
      return reply({ ok: true, redirect: "/" });
    }
    if (action.startsWith("recover/")) {
      if (locals.user)
        return error(
          "Use Security to change your password while signed in.",
          409,
        );
      if (action === "recover/start") {
        if (!validUsername(username)) return error("Enter your username.");
        clearRecovery(cookies);
        const user = await findUser(username);
        if (!user?.recovery_hash)
          return error(
            "Recovery is unavailable for those details. Check your username or use your password to sign in.",
          );
        return reply({ methods: ["passcode"] });
      }
      if (action === "recover/verify") {
        if (!(await rateLimit(bindings, `recovery:${username}`, 5, 900)))
          return error(
            "Too many recovery attempts. Try again in 15 minutes.",
            429,
          );
        if (!validUsername(username) || !validPasscode(body.passcode))
          return error("Check your username and recovery passcode.", 401);
        const user = await findUser(username);
        if (
          !(await verifyCredential(body.passcode, user?.recovery_hash)) ||
          !user
        )
          return error("Check your username and recovery passcode.", 401);
        await recoveryGrant(bindings, cookies, user);
        return reply({ ok: true });
      }
      if (action === "recover/complete") {
        if (!validPassword(body.password)) return error(PASSWORD_HELP);
        if (!validPasscode(body.passcode) || body.passcode === body.password)
          return error(
            "Choose a different 8-character recovery passcode for your account.",
          );
        const token = cookies.get(RECOVERY_COOKIE)?.value ?? "";
        const claims = await verifyToken(
          bindings.ZAHARI_JWT_SECRET,
          token,
          "recovery",
        );
        if (!claims)
          return error(
            "Your recovery window expired. Verify your passcode again.",
            401,
          );
        const passwordHash = await hashCredential(body.password);
        const recoveryHash = await hashCredential(body.passcode);
        const updated = await bindings.DB.prepare(
          `UPDATE users SET password_hash=?, recovery_hash=?, credential_version=credential_version+1
          WHERE id=? AND EXISTS(SELECT 1 FROM recovery_grants g WHERE g.id=? AND g.user_id=users.id AND g.credential_version=users.credential_version AND g.expires_at>?) RETURNING id`,
        )
          .bind(passwordHash, recoveryHash, claims.userId, claims.id, now())
          .first();
        clearRecovery(cookies);
        clearSession(cookies);
        if (!updated)
          return error(
            "Your recovery window expired or has already been used. Start again.",
            401,
          );
        return reply({ ok: true, redirect: "/signin?reset=1" });
      }
    }
    if (["password", "passcode", "logout-all"].includes(action)) {
      if (!locals.user) return error("Sign in to manage your security.", 401);
      const userId = locals.user.id;
      if (action === "password") {
        if (!validPassword(body.password)) return error(PASSWORD_HELP);
        const passwordHash = await hashCredential(body.password);
        const updated = await bindings.DB.prepare(
          `UPDATE users SET password_hash=?,credential_version=credential_version+1 WHERE id=?
          AND (SELECT COUNT(*) FROM password_changes WHERE user_id=? AND changed_at>?)<4 RETURNING id`,
        )
          .bind(passwordHash, userId, userId, now() - 86400)
          .first();
        if (!updated)
          return error(
            "You can change your password four times in 24 hours. Try again later.",
            429,
          );
        clearSession(cookies);
        clearRecovery(cookies);
        return reply({ ok: true, redirect: "/signin?reset=1" });
      }
      if (action === "passcode") {
        if (!(await rateLimit(bindings, `passcode:${userId}`, 8, 900)))
          return error("Too many attempts. Try again in 15 minutes.", 429);
        const user = await bindings.DB.prepare("SELECT * FROM users WHERE id=?")
          .bind(userId)
          .first<UserRow>();
        if (
          typeof body.currentPassword !== "string" ||
          body.currentPassword.length > 128 ||
          !(await verifyCredential(body.currentPassword, user?.password_hash))
        )
          return error("Your current password does not match.", 401);
        if (body.disable !== true && !validPasscode(body.passcode))
          return error(PASSCODE_HELP);
        if (body.passcode === body.currentPassword)
          return error("Use a passcode different from your password.");
        const value =
          body.disable === true
            ? null
            : await hashCredential(body.passcode as string);
        await bindings.DB.prepare("UPDATE users SET recovery_hash=? WHERE id=?")
          .bind(value, userId)
          .run();
        clearRecovery(cookies);
        return reply({ ok: true, hasPasscode: value !== null });
      }
      await bindings.DB.prepare("DELETE FROM sessions WHERE user_id=?")
        .bind(userId)
        .run();
      clearSession(cookies);
      clearRecovery(cookies);
      return reply({ ok: true, redirect: "/signin" });
    }
    return error("That action was not found.", 404);
  } catch {
    return error(
      "Something interrupted that request. Please try again shortly.",
      503,
    );
  }
};
