import type { APIRoute } from "astro";
import { bindings } from "../../lib/runtime";
const key = "SAMPLE.glb";
export const GET: APIRoute = async ({ request }) => {
  try {
    const object = await bindings.MODELS.get(key, { onlyIf: request.headers });
    if (!object)
      return new Response("Sample artwork is not available yet.", {
        status: 404,
      });
    const headers = new Headers({
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "public, max-age=3600",
      ETag: object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    if (!("body" in object))
      return new Response(null, { status: 304, headers });
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { headers });
  } catch {
    return new Response("The sample artwork could not be loaded.", {
      status: 503,
    });
  }
};
export const HEAD: APIRoute = async () => {
  try {
    const object = await bindings.MODELS.head(key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(null, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": String(object.size),
        ETag: object.httpEtag,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};
