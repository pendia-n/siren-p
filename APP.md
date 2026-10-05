# Zahari

Zahari is SirenP's coin-inspired visual world app. The public scene uses the supplied SAMPLE.glb and three layered locations with 3D contact terrain and animated illustrated atmosphere. A new account sees only that SAMPLE; coin GLBs require a paid Stripe subscription and a selected coin. Visitors can orbit the artwork, change lighting and download a screenshot.

## What works in this release

- Responsive landing, signup, signin, signed-out recovery, signed-in security, profile, about, pricing and announcements pages.
- Unique usernames and salted PBKDF2 password/passcode hashes in Cloudflare D1.
- Revocable 56-day JWT sessions using Secure, HttpOnly, SameSite=Lax cookies. No authentication tokens in browser storage.
- Password changes, recovery-code enable/replace/disable and global sign-out. Verified recovery is a short-lived, single-use grant.
- Three.js loads the public sample and, for authorized members, selected coin worlds from a private R2 bucket through Worker routes. The browser receives authorized models to render them; a private bucket does not prevent those members saving delivered model bytes.
- Dawn, daylight, dusk and night select from browser local time on each entry and remain manually switchable. The sample offers lowland, Pacific and sky locations with 3D terrain, animated grass/water/clouds and reduced-motion support.
- Original Zahari SVG branding and local web fonts.

## Why it exists

The intended experience is discovery and appreciation, not pressure to trade. Direct camera controls give visitors a clear first action, explicit preview notices avoid mistaking the scene for a signal, and separate account/security/recovery pages make it clear where to go when access needs attention. Each future subject should preserve its own artistic identity; BTC is a fortress, not a generic category label.

## Boundaries

The current code adds subscription Checkout, signed Stripe webhooks, coin selection, a read-only local MySQL-to-D1 uploader, ST/1m-driven authored model selection, and Tavily-backed news. It has passed local typecheck, build and unit tests, but remote migrations, secrets, Stripe Products, the feed, webhook destination and end-to-end payment tests are not yet verified. Until those are finished, it is not a live paid product. The app does not provide trading predictions or all 28 assets. Lighting follows visitor local time on entry and is manually switchable; paid locations are determined by market data, not users. The supplied sample GLB has no authored animation clips; the scenery moves, but the model's geometry does not morph.

## Infrastructure

Code: `zahari/`. Worker: `zahari`. D1: `zahari-db`, bound as `DB`; no second D1 is needed. R2: `zahari-models`, bound as `MODELS`. The prior model upload reported 45 coin GLBs across AAVE, BNB, BTC, ETH, LINK, SOL, UNI and XAUT, plus `SAMPLE.glb` at its root; this turn did not reverify R2 remotely. The only public model route is `/media/SAMPLE.glb`; paid model routes verify subscription and coin selection.

Never commit or display authentication, Stripe, Tavily or feed secrets. See the code README for the required variable names, local setup and verification commands.
