import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { isAsset, ownsAsset } from "../../../lib/product";

const names: Record<string, string> = {
  AAVE: "Aave protocol",
  BNB: "BNB Binance",
  BTC: "Bitcoin",
  ETH: "Ethereum",
  LINK: "Chainlink",
  SOL: "Solana",
  UNI: "Uniswap",
  XAUT: "Tether Gold XAUT",
};
type NewsRow = {
  title: string | null;
  summary: string | null;
  source_url: string | null;
  published_at: string | null;
  visible_until: number;
  next_search_at: number;
};

export const GET: APIRoute = async ({ params, locals }) => {
  const asset = params.asset?.toUpperCase() ?? "";
  if (
    !locals.user ||
    !isAsset(asset) ||
    !(await ownsAsset(locals.user.id, asset))
  )
    return new Response(null, { status: 403 });
  const now = Math.floor(Date.now() / 1000);
  const cadence = await bindings.DB.prepare(
    `SELECT MIN(CASE m.tier WHEN 'eight' THEN 7200 WHEN 'five' THEN 14400 ELSE NULL END) AS seconds
     FROM coin_selections c JOIN memberships m ON m.user_id=c.user_id
     WHERE c.asset=? AND m.status IN ('active','trialing') AND m.current_period_end>?`,
  )
    .bind(asset, now)
    .first<{ seconds: number | null }>();
  if (!cadence?.seconds)
    return Response.json(
      { news: null, message: "News is not included with this membership." },
      { headers: { "Cache-Control": "no-store" } },
    );
  let row = await bindings.DB.prepare(
    "SELECT title,summary,source_url,published_at,visible_until,next_search_at FROM news_cache WHERE asset=?",
  )
    .bind(asset)
    .first<NewsRow>();
  if (!row) {
    await bindings.DB.prepare(
      "INSERT OR IGNORE INTO news_cache(asset) VALUES(?)",
    )
      .bind(asset)
      .run();
    row = await bindings.DB.prepare(
      "SELECT title,summary,source_url,published_at,visible_until,next_search_at FROM news_cache WHERE asset=?",
    )
      .bind(asset)
      .first<NewsRow>();
  }
  if (row && row.next_search_at <= now && bindings.TAVILY_API_KEY) {
    const lock = await bindings.DB.prepare(
      "UPDATE news_cache SET next_search_at=? WHERE asset=? AND next_search_at<=? RETURNING asset",
    )
      .bind(now + 120, asset, now)
      .first();
    if (lock) {
      let quotaExhausted = false;
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bindings.TAVILY_API_KEY}`,
          },
          body: JSON.stringify({
            query: `${names[asset]} latest project team or coin news`,
            topic: "news",
            search_depth: "basic",
            time_range: "day",
            max_results: 1,
            include_answer: "basic",
            include_published_date: true,
            include_raw_content: false,
            include_images: false,
          }),
        });
        if (!response.ok) {
          quotaExhausted = response.status === 432 || response.status === 433;
          throw new Error(`Tavily ${response.status}`);
        }
        const result = (await response.json()) as {
          answer?: string;
          results?: {
            title?: string;
            url?: string;
            content?: string;
            published_date?: string;
          }[];
        };
        const expected = names[asset].split(" ")[0].toLowerCase();
        const story = result.results?.find(
          (item) =>
            item.url?.startsWith("https://") &&
            item.title &&
            `${item.title} ${item.content ?? ""}`
              .toLowerCase()
              .includes(expected),
        );
        const summary = (result.answer || story?.content || "")
          .trim()
          .slice(0, 700);
        await bindings.DB.prepare(
          "UPDATE news_cache SET title=?,summary=?,source_url=?,published_at=?,fetched_at=?,visible_until=?,next_search_at=? WHERE asset=?",
        )
          .bind(
            story?.title ?? null,
            story && summary ? summary : null,
            story?.url ?? null,
            story?.published_date ?? null,
            now,
            story && summary ? now + 3600 : 0,
            now + cadence.seconds,
            asset,
          )
          .run();
      } catch {
        await bindings.DB.prepare(
          "UPDATE news_cache SET next_search_at=? WHERE asset=?",
        )
          .bind(now + (quotaExhausted ? 21600 : 600), asset)
          .run();
      }
    }
    row = await bindings.DB.prepare(
      "SELECT title,summary,source_url,published_at,visible_until,next_search_at FROM news_cache WHERE asset=?",
    )
      .bind(asset)
      .first<NewsRow>();
  }
  return Response.json(
    {
      news:
        row &&
        row.visible_until > now &&
        row.title &&
        row.summary &&
        row.source_url
          ? {
              title: row.title,
              summary: row.summary,
              url: row.source_url,
              publishedAt: row.published_at,
              expiresAt: row.visible_until,
            }
          : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
