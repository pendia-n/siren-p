---
name: zahari-data-rendered-viewer
description: Maintain Zahari's crypto-specific 3D/2.5D viewer, data-driven model and terrain selection, local lighting, plan limits, and news banner. Use when changing scene rules, viewer behavior, or market-data rendering.
---

# Zahari data-rendered viewer

Use this skill when changing the scene pipeline. Preserve each asset's authored identity and treat market data as a selector for designed visual states—not as proof of a price forecast.

## Source of truth

- `src/lib/catalog.ts` defines the eight launch assets, subject classes, model counts, plan windows, and refresh cadence.
- `src/lib/scene.ts` reads `localtod_st_15m` and caches each member/asset scene.
- `src/lib/scene-rules.ts` calculates the subject and terrain states.
- `src/components/Viewer.astro` and `src/scripts/viewer.ts` load the model, location, lighting controls, and news banner.
- `src/lib/scene-time.ts` defines the browser-local daylight mode.

## Data-to-scene rule

1. Query the most recent rows for the requested asset from `localtod_st_15m`, ordered by descending `shortid`. The plan window is 300 rows for One Coin, 600 for Five Coins, and 900 for Eight Coins. The query may fetch up to 2,200 rows so there is calibration history.
2. Rows are newest-first. For a feature and window of N rows, use signed mean consecutive change: `(newest - oldest) / (N - 1)`. Do not use percentage change for these bounded or zero-crossing features.
3. Normalize the current mean change against the 90th percentile of absolute mean changes from prior rolling windows of the same asset, feature, and window size. Exclude the current window; require at least 30 historical windows; clamp the result to `[-1, 1]`. A zero calibration scale maps to the sign of current change.
4. Feed normalized **deviation** into the asset's authored model-count bands. Model counts are AAVE 4, BNB 6, BTC 8, ETH 8, LINK 6, SOL 6, UNI 4, XAUT 3. Keep each boundary and numbered GLB mapping explicit; do not substitute a generic model or sort filenames without verifying their numbered suffixes.
5. Feed normalized **sigma** into the four placement bands: `< -0.5`, `[-0.5, 0)`, `[0, 0.5)`, and `>= 0.5`. Palace assets map lowland → buried lowland → sea → sky; pontoon assets map sea → lowland → buried lowland → sky; plane assets map sky → sea → lowland → buried lowland. In the code, sea is named `pacific` and burial is represented separately from the location.
6. These are discrete swaps among authored GLBs and location artwork, plus a burial offset. They do not deform arbitrary mesh geometry. Expect a visible state change at a boundary; do not add hysteresis or smooth interpolation without deciding and testing the resulting behavior.

## Timing and viewer behavior

- Plan refresh cadence is anchored to a coin's `selected_at`: 12 hours (One), 8 hours (Five), and 4 hours (Eight). The client may poll more often, but cached scene calculations must not run ahead of the plan cadence.
- Lighting starts from the browser device's local hour: dawn 6–9, day 9–15, dusk 15–19, night otherwise. Keep manual controls available; do not confuse local lighting time with the Worker news schedule, which uses New York time.
- Paid Five/Eight coin worlds can show a one-hour cached news banner for that asset. Escape provider text by assigning text content, and link only to a validated HTTPS source.
- Enforce coin capacity in both the UI and the server route. In Five Coins, the sixth unselected asset must have a disabled Choose button; the server must independently reject over-capacity inserts. A normal disabled button should not emit an error or create a console error.
- Keep sample artwork visibly separate from paid, data-conditioned scenes; do not present sample content as live market output.

## Freshness and validation limits

- `localtod_st_15m` stores `shortid` and the features used by the scene rule but has no source timestamp. `shortid` ordering is only a collection-order proxy; it cannot prove that the source observation is recent. Keep the UI disclosure and never call this a live-price freshness guarantee until timestamped ingestion is available.
- Test thresholds, all asset model counts, each location class, insufficient history, non-finite values, zero calibration, plan cadence boundaries, lighting boundaries, and slot limits with offline fixtures.
- Before claiming production end-to-end behavior, separately verify deployed code and bindings, R2 model inventory, D1 feed, authenticated UI, and payment/webhook configuration. Do not use a real charge or live news-provider request unless explicitly authorized.
