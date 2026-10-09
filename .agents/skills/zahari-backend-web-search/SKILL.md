---
name: zahari-backend-web-search
description: Maintain Zahari's Worker-based, paid-member crypto news search, provider adapters, summaries, and source-linked banner feed. Use when changing Tavily, Exa, Firecrawl, news scheduling, or news caching.
---

# Zahari backend web search

Use this skill when modifying Zahari's server-side news workflow. The goal is a short, attributable news card for a coin a member actually selected—not a generic search dashboard.

## Current flow

- `src/worker.ts` invokes `runNewsEdition` from an hourly Cloudflare Worker cron.
- `src/lib/news.ts` maps New York time to editions. The checked-in schedule is 9am, 1pm, and 9pm in `America/New_York`; weekday 9am/9pm use Tavily, weekday 1pm uses Exa, weekend 9am/9pm use Tavily's weekend key, and weekend 1pm uses Exa's weekend key. Reconcile any newer user instruction that conflicts with those hours before changing them.
- `src/lib/news-jobs.ts` selects `DISTINCT` assets held by unexpired active five- or eight-coin memberships. If there are no eligible selected coins, it makes no provider call. It claims each asset/edition once to prevent duplicate calls.
- Queries are generated per asset by `queryFor(asset)`. Do not search all launch coins just because they exist in the catalog.
- Tavily or Exa is primary for the edition. Firecrawl is currently exception-only fallback; a valid empty result does not invoke fallback.
- `decodeTavily`, `decodeExa`, and `decodeFirecrawl` normalize provider responses into a compact title, summary, highlight, publication time, provider, and source URL. The Worker caches a published story for one hour. The authenticated news API serves only the selected coin's cached story; the viewer renders a source link in its backdrop banner.

## Safety and quality rules

1. Keep keys in Worker secrets/bindings. Never read, print, log, commit, or include secret values in output. Never log raw provider requests or response bodies.
2. Treat provider responses as untrusted. Require an HTTPS source URL, an asset-relevant title/summary, a plausible publication time, and concise plain text. Build the banner with text nodes/text content; do not inject provider HTML.
3. Preserve source attribution. A generated summary must link to the exact supporting article. Do not assign a multi-source answer to an arbitrary first result.
4. Preserve deduplication across members: one search per distinct selected asset per scheduled edition, not one search per user.
5. Keep edition times timezone-aware (`America/New_York`) so daylight-saving changes do not shift the intended local schedule. The hourly cron is only a trigger; `editionAt` decides whether an edition is due.
6. Use fixture-based/offline tests for routing and decoders. Do not call live search APIs, spend credits, or test key validity unless the user explicitly authorizes a live provider test.
7. When provider schemas or pricing may have changed, inspect current official docs before changing request/decoder code:
   - [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
   - [Exa Search API](https://exa.ai/docs/reference/search)
   - [Firecrawl Search API](https://docs.firecrawl.dev/api-reference/endpoint/search)

## Known contract check before relying on fallback

The current Firecrawl path needs a careful contract recheck before anyone claims the backup works: it requests `sources: ["web"]`, passes `scrapeOptions.formats` as strings, and its decoder requires a publication date. The documented Firecrawl v2 search examples use typed format objects such as `{ type: "summary" }`; the documented web result shape does not guarantee a publication date, while the news result shape includes `date`. Do not make a live request as a shortcut. Add offline fixtures for the documented response shape, adjust request/decoder together only when authorized, and keep fallback failures visible through safe status metrics without logging source bodies or credentials.

## Validation checklist

- Test New York edition routing across weekdays, weekends, and daylight-saving boundaries.
- Test that no eligible selections means zero provider calls and multiple members selecting the same coin still produce one call for that coin.
- Test each documented provider response shape, invalid/missing dates, stale items, unsafe URLs, unrelated assets, malformed JSON, and provider failures with fixtures.
- Test that the banner displays a short readable summary and opens the exact HTTPS source in a new tab.
- Keep live API tests separate and opt-in; default checks must be offline and cost-free.
