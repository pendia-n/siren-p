import type { APIRoute } from "astro";
import { isAsset, membership, ownsAsset } from "../../../lib/product";
import { bindings } from "../../../lib/runtime";
import { sceneFor } from "../../../lib/scene";

export const GET: APIRoute = async ({ params, locals }) => {
  const asset = params.asset?.toUpperCase() ?? "";
  if (
    !locals.user ||
    !isAsset(asset) ||
    !(await ownsAsset(locals.user.id, asset))
  )
    return new Response(null, { status: 403 });
  const member = await membership(locals.user.id);
  const started = await bindings.DB.prepare(
    "SELECT started_at FROM memberships WHERE user_id=?",
  )
    .bind(locals.user.id)
    .first<{ started_at: number }>();
  const scene = member
    ? await sceneFor(locals.user.id, asset, member.tier, started?.started_at ?? 0)
    : null;
  if (!scene)
    return Response.json(
      { scene: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  return Response.json(
    {
      scene: {
        modelUrl: `/api/model/${asset}/${encodeURIComponent(scene.model_name)}`,
        location: scene.location,
        buried: Boolean(scene.buried),
        sourceTimestamp: scene.source_timestamp,
        expiresAt: scene.expires_at,
        stale: scene.stale,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
