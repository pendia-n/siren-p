import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { isAsset, ownsAsset, membership } from "../../../lib/product";
import {
  NEWS_COLUMNS,
  newsAccess,
  newsPreview,
  type CachedNews,
} from "../../../lib/news-preview";
export const GET: APIRoute = async ({ params, locals }) => {
  const asset = params.asset?.toUpperCase() ?? "";
  if (!isAsset(asset)) return new Response(null, { status: 404 });
  const member = locals.user ? await membership(locals.user.id) : null;
  const full =
    newsAccess(member) &&
    Boolean(locals.user && (await ownsAsset(locals.user.id, asset)));
  const row = await bindings.DB.prepare(
    `SELECT ${NEWS_COLUMNS} FROM news_cache WHERE asset=?`,
  )
    .bind(asset)
    .first<CachedNews>();
  return Response.json(
    {
      news:
        row?.title && row.summary && row.source_url
          ? newsPreview(row, full)
          : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
