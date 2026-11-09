import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { demoScene } from "../../../lib/sol-demo";

export const GET: APIRoute = async () =>
  Response.json(
    { scene: await demoScene(bindings.DB) },
    { headers: { "Cache-Control": "no-store" } },
  );
