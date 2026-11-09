import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";

export const GET: APIRoute = async ({ url }) => {
  const row = await bindings.DB.prepare(
    "SELECT model_name,computed_at FROM sol_demo_scene WHERE singleton=1",
  ).first<{ model_name: string | null; computed_at: number | null }>();
  if (
    !row?.model_name ||
    row.computed_at === null ||
    url.searchParams.get("v") !== String(row.computed_at) ||
    !/^[A-Z0-9_-]+_0[1-6]\.glb$/.test(row.model_name)
  ) {
    return new Response(null, { status: 404 });
  }
  const object = await bindings.MODELS.get(`sol/${row.model_name}`);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "no-store",
    },
  });
};
