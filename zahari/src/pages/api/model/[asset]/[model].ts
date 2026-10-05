import type { APIRoute } from "astro";
import { bindings } from "../../../../lib/runtime";
import { isAsset, ownsAsset } from "../../../../lib/product";

export const GET: APIRoute = async ({ params, locals, request }) => {
  const asset = params.asset?.toUpperCase() ?? "";
  const model = params.model ?? "";
  if (
    !locals.user ||
    !isAsset(asset) ||
    !(await ownsAsset(locals.user.id, asset))
  )
    return new Response(null, { status: 403 });
  if (!/^[A-Z0-9_\-]+\.glb$/.test(model))
    return new Response(null, { status: 400 });
  const key = `${asset.toLowerCase()}/${model}`;
  const object = await bindings.MODELS.get(key, { onlyIf: request.headers });
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({
    "Content-Type": "model/gltf-binary",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ETag: object.httpEtag,
  });
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
};
