import { chromium } from "@playwright/test";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://localhost:4321";
if (
  !base.startsWith("http://localhost:") &&
  process.env.ALLOW_LIVE_TEST !== "1"
)
  throw new Error("Explicit live test permission required.");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage();
  await page.goto(base + "/signin");
  const result = await page.evaluate(
    async (body) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zahari-Client": "web",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      const user = response.ok
        ? (await (await fetch("/api/auth/session")).json()).user
        : null;
      return {
        status: response.status,
        error: payload.error ?? null,
        userId: user?.id ?? null,
      };
    },
    {
      username: `probe_${Date.now().toString(36)}`,
      password: `Q${randomBytes(6).toString("hex")}`,
      passcode: randomBytes(4).toString("hex"),
    },
  );
  console.log(result);
  assert.equal(result.status, 201);
} finally {
  await browser.close();
}
