import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { demoNews } from "../../../lib/sol-demo";

export const GET: APIRoute = async () =>
  Response.json(
    { news: await demoNews(bindings.DB) },
    { headers: { "Cache-Control": "no-store" } },
  );
