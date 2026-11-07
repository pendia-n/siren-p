import type { Bindings } from "./auth";
import { ASSETS, isAsset } from "./catalog";
import {
  editionAt,
  searchExaCoin,
  searchTavilyCoin,
  searchFirecrawlCoin,
} from "./news";
const providers = { searchExaCoin, searchTavilyCoin, searchFirecrawlCoin };
export async function runNewsEdition(
  env: Bindings,
  date: Date,
  searches = providers,
) {
  const edition = editionAt(date);
  if (!edition) return;
  const now = Math.floor(date.getTime() / 1000);
  const selected = await env.DB.prepare(
    `SELECT DISTINCT c.asset FROM coin_selections c JOIN memberships m ON m.user_id=c.user_id WHERE m.status='active' AND m.tier IN ('five','eight') AND m.current_period_end>?`,
  )
    .bind(now)
    .all<{ asset: string }>();
  // Monday's 9am public sweep covers all eight coins, even with no members.
  // The set also prevents double searches for paid selections in that edition.
  const paidAssets = new Set(selected.results.map(({ asset }) => asset));
  const assets = new Set(edition.weekly ? ASSETS : paidAssets);
  for (const asset of assets) {
    if (!isAsset(asset)) continue;
    const range = edition.weekly && !paidAssets.has(asset) ? "week" : "day";
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
            ? await searches.searchExaCoin(asset, env[edition.key], date, range)
            : await searches.searchTavilyCoin(
                asset,
                env[edition.key],
                date,
                range,
              );
      } catch {
        result = await searches.searchFirecrawlCoin(
          asset,
          env.FIRECRAWL_HELEN,
          date,
          range,
        );
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
              0, // No display expiry: retain this story until a replacement is saved.
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
