import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const base = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const transport =
  process.env.API_HTTP_CLIENT === "playwright"
    ? await (
        await import("@playwright/test")
      ).request.newContext({ timeout: 60000 })
    : null;
async function request(url, options = {}) {
  if (!transport) return fetch(url, options);
  const response = await transport.fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    data: options.body,
    maxRedirects: options.redirect === "manual" ? 0 : 20,
  });
  const headers = new Headers();
  for (const { name, value } of response.headersArray())
    headers.append(name, value);
  const status = response.status();
  return new Response(
    [204, 205, 304].includes(status) ? null : await response.body(),
    { status, headers },
  );
}
if (
  !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) &&
  process.env.ALLOW_LIVE_TEST !== "1"
)
  throw new Error(
    "Set ALLOW_LIVE_TEST=1 to create a temporary test account on a live deployment.",
  );
class Client {
  cookies = new Map();
  async request(path, body, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      "X-Zahari-Client": "web",
      Origin: base,
      Cookie: [...this.cookies]
        .map(([key, value]) => `${key}=${value}`)
        .join("; "),
      ...options.headers,
    };
    const response = await request(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index),
        value = pair.slice(index + 1);
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    // Consume the network body before opening another connection.
    const content = await response.arrayBuffer();
    return new Response(content, {
      status: response.status,
      headers: response.headers,
    });
  }
  async api(action, body, status = 200) {
    const response = await this.request(`/api/auth/${action}`, body);
    assert.equal(
      response.status,
      status,
      `${action} expected ${status}, received ${response.status}`,
    );
    return response;
  }
}
const user = `qa_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`;
const first = new Client(),
  second = new Client(),
  recovery = new Client();
const password = `Q${randomBytes(6).toString("hex")}`;
const passcode = randomBytes(4).toString("hex");
let checks = 0;
const ok = (label) => {
  checks++;
  console.log(`PASS ${label}`);
};
assert.equal((await first.request("/security")).status, 303);
ok("private page redirects");
assert.equal(
  (
    await first.request(
      "/api/auth/register",
      {},
      { headers: { Origin: "https://evil.invalid" } },
    )
  ).status,
  403,
);
ok("cross-origin request rejected");
await first.api(
  "register",
  { username: user, password: "weak", passcode },
  400,
);
ok("server password validation");
const registration = await first.api(
  "register",
  { username: user, password, passcode },
  201,
);
const cookie = registration.headers
  .getSetCookie()
  .find((value) => value.startsWith("__Host-zahari_session="));
for (const flag of [
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  "Max-Age=4838400",
  "Path=/",
])
  assert.ok(
    cookie?.toLowerCase().includes(flag.toLowerCase()),
    `Missing cookie flag ${flag}`,
  );
const identity = await (await first.api("session")).json();
assert.equal(identity.user.username, user);
console.log(`TEST_ACCOUNT_ID=${identity.user.id}`);
ok("registration creates a 56-day secure HttpOnly session");
const studio = await first.request("/studio");
assert.equal(studio.status, 200);
assert.match(await studio.text(), /SAMPLE WORLD/);
assert.equal(
  (await first.request("/media/btc/BTC_FORTRESS_01.glb")).status,
  403,
);
assert.equal(
  (await request(`${base}/media/btc/BTC_FORTRESS_01.glb`)).status,
  403,
);
ok("unpaid signup sees SAMPLE and cannot download BTC model");
await second.api(
  "register",
  { username: user.toUpperCase(), password, passcode },
  409,
);
ok("case-insensitive unique username");
await second.api("login", { username: user, password: "wrong123" }, 401);
ok("invalid login rejected");
await second.api("login", { username: user, password });
ok("second device login");
const secondSession = second.cookies.get("__Host-zahari_session");
await first.api("password", { password: "Changed12345" });
assert.equal((await (await second.api("session")).json()).user, null);
ok("password change revokes other sessions");
await first.api("login", { username: user, password }, 401);
await first.api("login", { username: user, password: "Changed12345" });
ok("only the new password works");
await first.api("logout", {});
await recovery.api(
  "recover/complete",
  { password: "Recovered123", passcode: "abcd1234" },
  401,
);
ok("reset requires verified recovery grant");
await recovery.api("recover/start", { username: user });
await recovery.api(
  "recover/verify",
  { username: user, passcode: "wrong123" },
  401,
);
await recovery.api("recover/verify", { username: user, passcode });
const grant = recovery.cookies.get("__Host-zahari_recovery");
assert.ok(grant);
ok("passcode verification creates recovery-only cookie");
const replay = new Client();
replay.cookies.set("__Host-zahari_recovery", grant);
await recovery.api("recover/complete", {
  password: "Recovered123",
  passcode: "abcd1234",
});
await replay.api(
  "recover/complete",
  { password: "Replay12345", passcode: "efgh1234" },
  401,
);
ok("recovery grant is single-use");
second.cookies.set("__Host-zahari_session", secondSession);
assert.equal((await (await second.api("session")).json()).user, null);
ok("recovered credentials invalidate old sessions");
await first.api("login", { username: user, password: "Recovered123" });
await first.api(
  "passcode",
  { currentPassword: "wrong123", disable: true },
  401,
);
await first.api("passcode", {
  currentPassword: "Recovered123",
  passcode: "newc1234",
});
ok("replace recovery requires current password");
await first.api("passcode", { currentPassword: "Recovered123", disable: true });
await first.api("logout", {});
await recovery.api("recover/start", { username: user }, 400);
ok("disabled recovery cannot reset account");
await first.api("login", { username: user, password: "Recovered123" });
await first.api("passcode", {
  currentPassword: "Recovered123",
  passcode: "safe1234",
});
ok("recovery can be re-enabled");
// Two earlier successful resets are in the rolling audit window.
await first.api("password", { password: "Version3123" });
await first.api("login", { username: user, password: "Version3123" });
await first.api("password", { password: "Version4123" });
await first.api("login", { username: user, password: "Version4123" });
await first.api("password", { password: "Version5123" }, 429);
ok("password change limit enforced by database");
await second.api("login", { username: user, password: "Version4123" });
await first.api("logout-all", {});
assert.equal((await (await second.api("session")).json()).user, null);
ok("sign out everywhere revokes sessions");
for (let attempt = 0; attempt < 5; attempt++)
  await recovery.api(
    "recover/verify",
    { username: `missing_${user}`, passcode: "wrong123" },
    401,
  );
await recovery.api(
  "recover/verify",
  { username: `missing_${user}`, passcode: "wrong123" },
  429,
);
ok("passcode brute force is throttled");
const model = await request(`${base}/media/SAMPLE.glb`);
assert.equal(model.status, 200);
const modelData = Buffer.from(await model.arrayBuffer());
assert.equal(modelData.toString("ascii", 0, 4), "glTF");
if (process.env.TEST_SAMPLE_PATH)
  assert.equal(
    createHash("sha256").update(modelData).digest("hex"),
    createHash("sha256")
      .update(readFileSync(process.env.TEST_SAMPLE_PATH))
      .digest("hex"),
  );
const cached = await request(`${base}/media/SAMPLE.glb`, {
  headers: { "If-None-Match": model.headers.get("etag") },
});
assert.equal(cached.status, 304);
ok("R2 serves only the public SAMPLE with conditional caching");
console.log(
  `${checks} API checks passed. Clean up only test user ID printed above.`,
);
await transport?.dispose();
