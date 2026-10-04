# Zahari

Zahari is the working web preview of SirenP's coin-inspired visual worlds. The public scene uses the supplied SAMPLE.glb and three layered locations with 3D contact terrain and animated illustrated atmosphere; the signed-in studio shows the BTC Fortress. The app lets visitors orbit the artwork, change lighting and download a screenshot.

## What works in this release

- Responsive landing, signup, signin, signed-out recovery, signed-in security, profile, about, pricing and announcements pages.
- Unique usernames and salted PBKDF2 password/passcode hashes in Cloudflare D1.
- Revocable 56-day JWT sessions using Secure, HttpOnly, SameSite=Lax cookies. No authentication tokens in browser storage.
- Password changes, recovery-code enable/replace/disable and global sign-out. Verified recovery is a short-lived, single-use grant.
- Three.js loads the sample and BTC Fortress from a private R2 bucket through allowlisted Worker routes. The browser receives models to render them; a private bucket does not prevent viewers saving delivered model bytes.
- Dawn, daylight, dusk and night select from browser local time on each entry and remain manually switchable. The sample offers lowland, Pacific and sky locations with 3D terrain, animated grass/water/clouds and reduced-motion support.
- Original Zahari SVG branding and local web fonts.

## Why it exists

The intended experience is discovery and appreciation, not pressure to trade. Direct camera controls give visitors a clear first action, explicit preview notices avoid mistaking the scene for a signal, and separate account/security/recovery pages make it clear where to go when access needs attention. Each future subject should preserve its own artistic identity; BTC is a fortress, not a generic category label.

## Boundaries

This release does not connect Vautim, news, sentiment, billing, prediction models, structural variants, all 28 assets or persistent saved scenes. Its pricing page lists the three user-specified monthly prices ($4.99 for one coin, $8.99 for five, $12.99 for all eight launch coins) without a free membership tier; checkout is not live. Lighting follows visitor local time on entry and is manually switchable. The supplied sample GLB has no authored animation clips; the scenery moves, but the model's geometry does not morph.

## Infrastructure

Code: `zahari/`. Worker: `zahari`. D1: `zahari-db`, bound as `DB`. R2: `zahari-models`, bound as `MODELS`. The bucket contains 45 coin GLBs across AAVE, BNB, BTC, ETH, LINK, SOL, UNI and XAUT, plus `SAMPLE.glb` at its root. Current public routes: `/media/SAMPLE.glb` and `/media/btc/BTC_FORTRESS_01.glb`.

The generated `ZAHARI_JWT_SECRET` is saved only in ignored `zahari/.env` and the Cloudflare Worker secret. Never commit or display it. See the code README for local setup and verification commands.
