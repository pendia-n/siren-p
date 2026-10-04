import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";

const base = process.env.TEST_BASE_URL ?? "http://localhost:4321";
if (
  !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) &&
  process.env.ALLOW_LIVE_TEST !== "1"
)
  throw new Error("Live browser tests require explicit ALLOW_LIVE_TEST=1.");
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args:
    process.env.TEST_NATIVE_GPU === "1"
      ? []
      : [
          "--enable-webgl",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultNavigationTimeout(90000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 700));
});
const user = `ui_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`;
const password = `V${randomBytes(6).toString("hex")}`;
const passcode = randomBytes(4).toString("hex");
mkdirSync("test-results", { recursive: true });
try {
  if (process.env.SKIP_VISUAL !== "1") {
    await page.goto(base);
    await page.waitForLoadState("networkidle");
    const expectedLogo = createHash("sha256")
      .update(readFileSync(new URL("../../zahari.svg", import.meta.url)))
      .digest("hex");
    for (const selector of ['link[rel="icon"]', ".brand img"]) {
      const actual = await page.locator(selector).evaluate(async (element) => {
        const url = element.getAttribute("href") ?? element.getAttribute("src");
        const response = await fetch(url);
        if (!response.ok) throw new Error("Brand asset unavailable");
        const hash = await crypto.subtle.digest(
          "SHA-256",
          await response.arrayBuffer(),
        );
        return Array.from(new Uint8Array(hash), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      });
      assert.equal(
        actual,
        expectedLogo,
        `${selector} must use the user's exact SVG`,
      );
    }
    assert.equal(
      await page
        .locator(".brand img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
      true,
    );
    console.log("PASS favicon and visible logo match the supplied SVG exactly");
    console.log("RECON", await page.getByRole("heading").allTextContents());
    console.log("CONTROLS", await page.getByRole("button").allTextContents());
    await page
      .locator('[data-viewer][data-loaded="true"]')
      .waitFor({ timeout: 60000 });
    assert.equal(
      await page.locator("[data-viewer]").getAttribute("data-sample"),
      "true",
    );
    const localHour = await page.evaluate(() => new Date().getHours());
    const initialMood =
      localHour >= 6 && localHour < 9
        ? "dawn"
        : localHour >= 9 && localHour < 15
          ? "day"
          : localHour >= 15 && localHour < 19
            ? "dusk"
            : "night";
    assert.equal(
      await page.locator("[data-viewer]").getAttribute("data-mood"),
      initialMood,
    );
    for (const location of ["lowland", "pacific", "sky"]) {
      await page.locator(`[data-location="${location}"]`).click();
      assert.equal(
        await page
          .locator(`[data-location="${location}"]`)
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.screenshot({ path: `test-results/sample-${location}.png` });
    }
    await page.locator('[data-location="lowland"]').click();
    await page.screenshot({
      path: "test-results/desktop-home.png",
      fullPage: true,
    });
    assert.equal(await page.locator("canvas").count(), 2);
    await page.getByRole("button", { name: "Night", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Night", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "Dawn", exact: true }).click();
    assert.equal(
      await page.locator("[data-viewer]").getAttribute("data-mood"),
      "dawn",
    );
    await page
      .getByRole("button", { name: "Start rotation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pause rotation", exact: true })
      .click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save image", exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.png$/);
    await download.saveAs("test-results/fortress-capture.png");
    console.log("PASS real GLB, lighting, rotation and PNG capture");
    for (const width of [360, 390, 768, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `horizontal overflow at ${width}`,
      );
      await page.screenshot({
        path: `test-results/home-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/signup`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Username", { exact: true }).fill(user);
  await page
    .getByText("This username is available.", { exact: true })
    .waitFor();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByLabel("Recovery passcode", { exact: true }).fill(passcode);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/studio", { timeout: 30000 });
  if (process.env.SKIP_VISUAL !== "1")
    await page
      .locator('[data-viewer][data-loaded="true"]')
      .waitFor({ timeout: 60000 });
  const session = (await context.cookies()).find(
    (cookie) => cookie.name === "__Host-zahari_session",
  );
  assert.ok(session?.httpOnly && session.secure && session.sameSite === "Lax");
  assert.ok(Math.abs(session.expires - Date.now() / 1000 - 4838400) < 30);
  assert.equal(
    await page.evaluate(() => document.cookie.includes("zahari_session")),
    false,
  );
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  const identity = await (
    await context.request.get(`${base}/api/auth/session`)
  ).json();
  console.log(`TEST_ACCOUNT_ID=${identity.user.id}`);
  if (process.env.SKIP_VISUAL !== "1")
    await page.screenshot({
      path: "test-results/mobile-studio.png",
      fullPage: true,
    });
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page
    .getByRole("link", { name: "Change password", exact: false })
    .click();
  await page
    .getByLabel("New password", { exact: true })
    .fill("BrowserChanged123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("BrowserChanged123");
  await page.screenshot({
    path: "test-results/mobile-security.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await page.waitForURL("**/signin?reset=1", { timeout: 30000 });
  await page
    .getByRole("link", { name: "Forgot your password?", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(user);
  await page
    .getByRole("button", { name: "Find recovery options", exact: true })
    .click();
  await page
    .getByLabel("Recovery method", { exact: true })
    .selectOption("passcode");
  await page.getByLabel("Recovery passcode", { exact: true }).fill(passcode);
  await page
    .getByRole("button", { name: "Verify passcode", exact: true })
    .click();
  await page.getByLabel("New password", { exact: true }).fill("Restored123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Restored123");
  await page
    .getByLabel("Replacement recovery passcode", { exact: true })
    .fill("saved123");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await page.waitForURL("**/signin?reset=1", { timeout: 30000 });
  await page.getByLabel("Username", { exact: true }).fill(user);
  await page.getByLabel("Password", { exact: true }).fill("Restored123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/studio", { timeout: 30000 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(base + "/");
  console.log(
    "PASS signup, visible profile security links, password change, staged recovery, signin and logout",
  );
  for (const route of [
    "/signin",
    "/signup",
    "/recovery",
    "/pricing",
    "/about",
    "/announcements",
  ]) {
    await page.goto(base + route);
    await page.waitForLoadState("networkidle");
    if (route === "/pricing") {
      assert.equal(await page.locator('nav[aria-label="Main navigation"] a[href="/pricing"]').count(), 1);
      assert.equal(await page.locator(".plan-card").count(), 3);
      assert.deepEqual(
        await page.locator(".plan-price").allTextContents(),
        ["$4.99 USD / month", "$8.99 USD / month", "$12.99 USD / month"],
      );
      assert.equal(await page.locator(".plan-card").filter({ hasText: "Free" }).count(), 0);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow at ${route}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS responsive layouts and no browser JavaScript/console errors",
  );
} catch (error) {
  console.log("BROWSER_ERRORS", errors);
  console.log(
    "VISIBLE_STATUS",
    await page
      .locator("[data-progress], .form-status")
      .allTextContents()
      .catch(() => []),
  );
  await page
    .screenshot({ path: "test-results/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
