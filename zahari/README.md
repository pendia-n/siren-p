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

Browser tests use Playwright with installed Chrome. Screenshots and downloads are saved in ignored `test-results/`. Both integration suites create temporary accounts and print only their IDs, never passwords or cookies. Remove only the printed test account IDs after a live verification. Set `TEST_BASE_URL` when the local server chooses another port. A live run additionally requires `ALLOW_LIVE_TEST=1` to prevent accidental account creation. Set `TEST_MODEL_PATH` to the original GLB to verify its SHA-256 against the delivered model.

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

Sign-up never grants a coin world: `/studio` shows SAMPLE until a paid subscription is confirmed by a signed Stripe webhook. Create **three separate Stripe Products** (One, Five, Eight) and configure their IDs as ordinary Worker variables `STRIPE_PRODUCT_ONE_ID`, `STRIPE_PRODUCT_FIVE_ID`, `STRIPE_PRODUCT_EIGHT_ID`. Checkout creates a monthly recurring Price dynamically for the chosen Product at $4.99, $8.99 or $12.99; no Price ID is required. This generates a new Stripe Price for each checkout, while Product IDs keep Dashboard filtering stable. Configure the Stripe Billing Portal for cancellation and payment-method management; do not enable plan changes there until tier changes are synchronized with the app.

Worker secrets (names only): existing `ZAHARI_JWT_SECRET`, `STRIPE_API_KEY` (prefer a minimum-permission restricted key), `STRIPE_WEBHOOK_SECRET` (specific to the Stripe endpoint), `ZAHARI_INGEST_SECRET` (new random HMAC secret shared with the local uploader), and `TAVILY_API_KEY` for Five/Eight news. Do not place any values in this repository. Stripe Workbench should send signed subscription Checkout, invoice and `customer.subscription.*` events to `https://zahari.pendia-community.workers.dev/api/billing/webhook`. Test and live endpoints use different signing secrets. Apply migrations `0002`–`0005` **before** deploying this Worker. A Checkout is rejected until all eight coins have a recent ST/1m feed, so a customer is not charged for an empty world.

There is no second D1 database. The existing `zahari-db` gains membership, selected-coin, rolling scene, news-cache and market-row tables. `scripts/push-market.go` is a read-only MySQL uploader: from the existing silvering Go module, provide `ZAHARI_MYSQL_DSN` (with `parseTime=true`), `ZAHARI_INGEST_SECRET` and `ZAHARI_INGEST_URL=https://zahari.pendia-community.workers.dev/api/market/ingest`, then run it after the collector. It initially sends up to 900 recent ST/1m rows per launch coin, then only increasing IDs. Its local cursor file lives under the OS user config directory and it never writes to MySQL. Schedule it by invoking it from the already-running collector workflow; no additional macOS cron job is required. A missed run catches up to 5,000 rows per coin on the next invocation.

The first paid scene uses the latest 300, 600 or 900 ST/1m rows for the three tiers. The authored model index uses relative `x` and `deviation`; `sigma` selects four class-specific locations. Scenes refresh on a viewer request no sooner than 4 hours, 90 minutes or 22 minutes after the billing-start-aligned prior state. News is shared per coin, not searched per customer: One has none; Five checks at most every four hours; Eight at most every two hours while viewed. A verified Tavily story remains visible for one hour. No Firecrawl or Exa key is required in V1.

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

This code requires production secrets, three Stripe Product IDs, remote D1 migrations, a functioning MySQL-to-D1 feed, a Stripe webhook destination and live Checkout tests before it can be called operational. The local build alone does not prove the deployed payment flow. There is no prediction or trading signal. Four lighting modes initialize from browser local time and can be changed manually. The public sample has three layered locations with 3D ground contact, moving grass/water/clouds and reduced-motion support. No domain was purchased or connected.
