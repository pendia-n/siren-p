import type { Bindings } from "./auth";
import { isAsset } from "./catalog";
import {
  editionAt,
  searchExaCoin,
  searchTavilyCoin,
  searchFirecrawlCoin,
} from "./news";
export async function runNewsEdition(env: Bindings, date: Date) {
  const edition = editionAt(date);
  if (!edition) return;
  const now = Math.floor(date.getTime() / 1000);
  const selected = await env.DB.prepare(
    `SELECT DISTINCT c.asset FROM coin_selections c JOIN memberships m ON m.user_id=c.user_id WHERE m.status='active' AND m.tier IN ('five','eight') AND m.current_period_end>?`,
  )
    .bind(now)
    .all<{ asset: string }>();
  // No eligible paid selection means no provider call, including the backup.
  for (const { asset } of selected.results) {
    if (!isAsset(asset)) continue;
    const claimed = await env.DB.prepare(
      "INSERT OR IGNORE INTO news_editions(edition,asset,provider,created_at) VALUES(?,?,?,?) RETURNING asset",
    )
      .bind(edition.id, asset, edition.provider, now)
      .first();
    if (!claimed) continue;
    let state = "empty";
    try {
      let result;
      try {
        result =
          edition.provider === "exa"
            ? await searchExaCoin(asset, env[edition.key], date)
            : await searchTavilyCoin(asset, env[edition.key], date);
      } catch {
        result = await searchFirecrawlCoin(asset, env.FIRECRAWL_HELEN, date);
      }
      if (result) {
        const previous = await env.DB.prepare(
          "SELECT source_url,title FROM news_cache WHERE asset=?",
        )
          .bind(asset)
          .first<{ source_url: string; title: string }>();
        if (
          previous?.source_url === result.url &&
          previous.title === result.title
        )
          state = "duplicate";
        else {
          const published = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            `INSERT INTO news_cache(asset,title,summary,source_url,published_at,fetched_at,visible_until,next_search_at,highlight,provider) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset) DO UPDATE SET title=excluded.title,summary=excluded.summary,source_url=excluded.source_url,published_at=excluded.published_at,fetched_at=excluded.fetched_at,visible_until=excluded.visible_until,next_search_at=excluded.next_search_at,highlight=excluded.highlight,provider=excluded.provider`,
          )
            .bind(
              asset,
              result.title,
              result.summary,
              result.url,
              result.publishedAt,
              published,
              published + 3600,
              0,
              result.highlight,
              result.provider,
            )
            .run();
          state = "published";
        }
      }
    } catch {
      state = "failed"; /* Never log provider bodies or credentials. */
    }
    await env.DB.prepare(
      "UPDATE news_editions SET state=? WHERE edition=? AND asset=?",
    )
      .bind(state, edition.id, asset)
      .run();
  }
}
