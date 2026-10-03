# Zahari

Zahari is the working web preview of SirenP's coin-inspired visual worlds. The first scene is the user's BTC Fortress GLB. The app offers a quiet, manipulable piece of art rather than a trading dashboard: orbit the object, change lighting, and download a screenshot.

## What works in this release

- Responsive landing, signup, signin, signed-out recovery, signed-in security, profile, about, pricing and announcements pages.
- Unique usernames and salted PBKDF2 password/passcode hashes in Cloudflare D1.
- Revocable 56-day JWT sessions using Secure, HttpOnly, SameSite=Lax cookies. No authentication tokens in browser storage.
- Password changes, recovery-code enable/replace/disable and global sign-out. Verified recovery is a short-lived, single-use grant.
- Three.js loads the supplied fortress from a private R2 bucket through an allowlisted Worker route. The browser receives the model to render it; a private bucket does not prevent viewers saving delivered model bytes.
- Original Zahari SVG branding and local web fonts.

## Why it exists

The intended experience is discovery and appreciation, not pressure to trade. Direct camera controls give visitors a clear first action, explicit preview notices avoid mistaking the scene for a signal, and separate account/security/recovery pages make it clear where to go when access needs attention. Each future subject should preserve its own artistic identity; BTC is a fortress, not a generic category label.

## Boundaries

This release does not connect Vautim, news, sentiment, billing, prediction models, structural variants, all 28 assets or persistent saved scenes. Its price page describes the free preview, not a finalized business model. Lighting controls are visitor-controlled, not market-driven. The supplied GLB has no authored animation clips; orbiting it does not invent changing geometry.

## Infrastructure

Code: `zahari/`. Worker: `zahari`. D1: `zahari-db`, bound as `DB`. R2: `zahari-models`, bound as `MODELS`. Model key: `btc/BTC_FORTRESS_01.glb`. Route: `/media/btc/BTC_FORTRESS_01.glb`.

The generated `ZAHARI_JWT_SECRET` is saved only in ignored `zahari/.env` and the Cloudflare Worker secret. Never commit or display it. See the code README for local setup and verification commands.
