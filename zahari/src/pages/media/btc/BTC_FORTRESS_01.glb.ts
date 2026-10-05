import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { session } from "../../../lib/auth";
const key = "btc/BTC_FORTRESS_01.glb";
async function authorized(cookies: Parameters<typeof session>[1]) {
  const current = await session(bindings, cookies);
  if (!current) return false;
  const membership = await bindings.DB.prepare(
    "SELECT 1 FROM memberships m JOIN coin_selections c ON c.user_id=m.user_id WHERE m.user_id=? AND m.status IN ('active','trialing') AND m.current_period_end>? AND c.asset='BTC' LIMIT 1",
  )
    .bind(current.user.id, Math.floor(Date.now() / 1000))
    .first();
  return Boolean(membership);
}
export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    if (!(await authorized(cookies)))
      return new Response("Membership required.", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    const object = await bindings.MODELS.get(key, { onlyIf: request.headers });
    if (!object)
      return new Response("This model is not available yet.", { status: 404 });
    const headers = new Headers({
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "private, no-store",
      ETag: object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    if (!("body" in object))
      return new Response(null, { status: 304, headers });
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { headers });
  } catch {
    return new Response("The model could not be loaded. Please try again.", {
      status: 503,
    });
  }
};
export const HEAD: APIRoute = async ({ cookies }) => {
  try {
    if (!(await authorized(cookies)))
      return new Response(null, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    const object = await bindings.MODELS.head(key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(null, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": String(object.size),
        ETag: object.httpEtag,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};
