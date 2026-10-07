import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { isAsset, MODEL_COUNTS } from "../../../lib/catalog";
export const GET: APIRoute = async ({ params, request }) => {
  const match = /^([A-Z]+)(\d{2})\.png$/.exec(params.file ?? "");
  if (
    !match ||
    !isAsset(match[1]) ||
    Number(match[2]) < 1 ||
    Number(match[2]) > MODEL_COUNTS[match[1]]
  )
    return new Response(null, { status: 404 });
  const object = await bindings.MODELS.get(`preview/${params.file}`);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=3600",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  if (request.headers.get("If-None-Match") === object.httpEtag)
    return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
};
