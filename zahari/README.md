# Zahari

Astro + Cloudflare Worker app with D1 authentication, a public SAMPLE.glb viewer and subscription-gated coin worlds. `../APP.md` describes the original preview and may lag this implementation.

## Local development

Use Node 22.12+ and pnpm. Run commands from this directory.

```sh
pnpm install --frozen-lockfile
pnpm setup:secret
pnpm exec wrangler d1 migrations apply DB --local
pnpm exec wrangler r2 object put zahari-models/btc/BTC_FORTRESS_01.glb --file /absolute/path/to/BTC_FORTRESS_01.glb --content-type model/gltf-binary --local
pnpm exec wrangler r2 object put zahari-models/SAMPLE.glb --file /absolute/path/to/SAMPLE.glb --content-type model/gltf-binary --local
pnpm exec astro dev --background
```

`setup:secret` uses `openssl rand -hex 32` to create the project-scoped `ZAHARI_JWT_SECRET` in ignored `.env` with permissions 600. It does not print, overwrite or rotate an existing file. Never commit this file. Local Wrangler loads it automatically.

Manage the background server with `pnpm exec astro dev status`, `logs` and `stop`. Stop it before running a build/typecheck, as those commands can invalidate the same dependency cache.

## Verification

```sh
pnpm test
pnpm check
pnpm build
# Run API/browser tests after starting the dev server, not during a rebuild.
pnpm test:api
node tests/browser.mjs
```

Browser tests use Playwright with installed Chrome. Screenshots and downloads are saved in ignored `test-results/`. Both integration suites create temporary accounts and print only their IDs, never passwords or cookies. Remove only the printed test account IDs after a live verification. Set `TEST_BASE_URL` when the local server chooses another port. A live run additionally requires `ALLOW_LIVE_TEST=1` to prevent accidental account creation. Set `TEST_SAMPLE_PATH` to the original SAMPLE.glb to verify its SHA-256 against the delivered public model.

## Deployment

Resources are declared in `wrangler.jsonc`: Worker `zahari`, D1 `zahari-db`, R2 `zahari-models`. All 46 GLBs from the eight asset folders and the root sample were uploaded to R2, not Git or the static build. `scripts/sync-models.mjs` accepts a source directory for uploads and complete remote SHA-256 verification.

```sh
pnpm exec wrangler whoami
pnpm exec wrangler d1 migrations apply DB --remote
node scripts/sync-models.mjs upload /absolute/path/to/model-source
node scripts/sync-models.mjs verify /absolute/path/to/model-source
pnpm exec wrangler secret bulk .env
pnpm deploy
```

`/media/SAMPLE.glb` is public. The legacy BTC route and all `/api/model/:asset/:model` routes require an active subscription and selected coin. No client-side R2 credentials or bucket upload endpoints exist. The browser necessarily receives an authorized model's bytes; this is not DRM. Paid model responses are private and non-cacheable.

## Billing and data feed

Sign-up never grants a coin world: `/studio` shows SAMPLE until a paid subscription is confirmed by a signed Stripe webhook. Checkout creates the monthly recurring Price and its named Product inline at $4.99, $8.99 or $12.99; no Stripe Product ID or Price ID configuration is required. Configure the Stripe Billing Portal for cancellation and payment-method management; do not enable plan changes there until tier changes are synchronized with the app.

Worker secrets (names only): `ZAHARI_JWT_SECRET`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `TAVILY_HELEN`, `TAVILY_2024`, `EXA_HELEN`, `EXA_2024`, `FIRECRAWL_HELEN`. The legacy ingest endpoint separately uses `ZAHARI_INGEST_SECRET`; localtod uses Wrangler's login. Do not place secret values in this repository. Stripe Workbench sends signed subscription Checkout, invoice and `customer.subscription.*` events to `/api/billing/webhook`. Apply migrations through `0009_market_range.sql`. Checkout requires all eight assets to have at least the plan's 1,100, 2,200 or 3,300 observations and sufficient authored models.

The active scene dataset is `zahari-db.localtod_st_15m`, with exactly `id,shortid,deviation,sigma,asset,close,timestamp`. `/Users/nosensetxt/silvering/localtod` uploads all eight coins manually with `pnpm start "END YYYY-MM-DD HH:mm:ss" "START YYYY-MM-DD HH:mm:ss"`. It reads MySQL `vautim.st` without writes, combining exact gaps 1m/3m/5m/15m/30m and inclusive date bounds. It replaces only that market table, retains a private backup, verifies source fields, and expires scene caches. It never loops or schedules itself. The legacy Go uploader writes a separate table and does not drive the viewer.

Each scene recalculation chooses a random complete chronological window of 1,100/2,200/3,300 rows for One/Five/Eight. Ordering uses timestamp then serial id; partial windows are rejected. Mean deviation change chooses the authored subject state; mean sigma change chooses class-specific terrain, normalized by the 90th percentile of other complete windows in the same uploaded history. Scenes retain the 12/8/4-hour selection-anchored cadence. News is shared across distinct selected coins of active unexpired Five/Eight members at 9am/1pm/9pm New York time, using Tavily at 9am/9pm and Exa at 1pm with weekday/weekend keys. Firecrawl is exception-only backup. No eligible coins means no search, and viewing or uploading adds no searches. Stories remain visible for one hour.

## Authentication API

JSON POST requests require `Content-Type: application/json` and `X-Zahari-Client: web`. Browser requests must be same-origin. Cookie sessions are used by both UI and API; no bearer credentials are put in local storage.

| Endpoint under `/api/auth/`     | Body or use                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| `register`                      | `username`, `password`, `passcode`                              |
| `login`                         | `username`, `password`                                          |
| `logout`, `logout-all`          | Empty JSON object                                               |
| `password`                      | Signed-in `password`; revokes all sessions                      |
| `passcode`                      | `currentPassword` and new `passcode`, or `disable: true`        |
| `recover/start`                 | `username`; returns enabled methods                             |
| `recover/verify`                | `username`, `passcode`; issues a 10-minute recovery cookie      |
| `recover/complete`              | `password`, replacement `passcode`; consumes the recovery grant |
| `session` (GET)                 | Sanitized current user or null                                  |
| `availability?username=…` (GET) | Username availability                                           |

Passwords require 7–18 characters with a letter and digit; passcodes are exactly 8 lowercase letters/digits. Both use Web Crypto (`crypto.subtle`) PBKDF2-HMAC-SHA-256 with independent 16-byte random salts and 100,000 iterations, the verified production Workers limit. This is below OWASP's 600,000-iteration recommendation, not equivalent protection. Legacy 600,000-iteration hashes retain verification support only on runtimes supporting that cost; production had zero users before this change. Sessions last 56 days with Secure, HttpOnly, SameSite=Lax cookies and server-side revocation. Recovery and login tokens have separate purposes. D1 triggers atomically invalidate sessions/recovery grants on password changes. Password resets count toward a rolling four-per-24-hour change limit. HMAC-keyed database throttles limit login, registration, lookup and recovery attempts without storing raw IP addresses.

## Boundaries

The scene samples uploaded historical observations; it is not a price forecast. Source and offline tests verify the code logic without requiring a live payment or news-provider call. Four lighting modes initialize from browser local time and can be changed manually. The public sample has three layered locations with 3D ground contact, moving grass/water/clouds and reduced-motion support.
