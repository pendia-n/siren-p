# Zahari

Astro + Cloudflare Worker app with D1 authentication, a public SAMPLE.glb viewer and an R2-backed BTC Fortress studio. Product scope is documented in `../APP.md`.

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

Only the allowlisted `/media/SAMPLE.glb` and `/media/btc/BTC_FORTRESS_01.glb` routes serve the private bucket. Other uploaded models are not yet presented in the app. No client-side R2 credentials or bucket upload endpoints exist. The browser necessarily receives the model bytes; this is not DRM. Model responses include ETags; account responses must never be cached.

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

Live market data/news, prediction, payments, an eight-world selector and structural model variants are not implemented in this release. The site says so explicitly. Four lighting modes initialize from browser local time and can be changed manually. The public sample has three illustrated 2.5D locations. The pricing page shows proposed memberships that cannot be purchased yet. No domain was purchased or connected.
