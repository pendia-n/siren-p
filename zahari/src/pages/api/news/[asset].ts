import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { isAsset, ownsAsset, membership } from "../../../lib/product";
export const GET: APIRoute = async ({ params, locals }) => {
  const asset = params.asset?.toUpperCase() ?? "";
  if (
    !locals.user ||
    !isAsset(asset) ||
    !(await ownsAsset(locals.user.id, asset))
  )
    return new Response(null, { status: 403 });
  const member = await membership(locals.user.id);
  if (!member || member.status !== "active" || member.tier === "one")
    return Response.json(
      { news: null, message: "News is not included with this membership." },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  const row = await bindings.DB.prepare(
    "SELECT title,summary,source_url,published_at,visible_until,highlight FROM news_cache WHERE asset=? AND visible_until>?",
  )
    .bind(asset, Math.floor(Date.now() / 1000))
    .first<{
      title: string;
      summary: string;
      source_url: string;
      published_at: string;
      visible_until: number;
      highlight: string;
    }>();
  return Response.json(
    {
      news:
        row?.title && row.summary && row.source_url
          ? {
              title: row.title,
              summary: row.summary,
              url: row.source_url,
              publishedAt: row.published_at,
              expiresAt: row.visible_until,
              highlight: row.highlight,
            }
          : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
