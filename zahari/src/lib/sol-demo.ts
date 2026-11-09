import type { Bindings } from "./auth";
import { computeScene } from "./scene-compute";
import type { SceneLocation } from "./scene-rules";
import { NEWS_COLUMNS, newsPreview, type CachedNews } from "./news-preview";

type SceneRow = {
  computed_at: number | null;
  model_name: string | null;
  location: SceneLocation | null;
  buried: number;
};

export async function demoScene(db: D1Database, now = Date.now()) {
  const row = await db
    .prepare(
      "SELECT computed_at,model_name,location,buried FROM sol_demo_scene WHERE singleton=1",
    )
    .first<SceneRow>();
  if (!row?.model_name || !row.location || row.computed_at === null)
    return null;
  return {
    modelUrl: `/api/demo/model?v=${row.computed_at}`,
    location: row.location,
    buried: Boolean(row.buried),
    computedAt: row.computed_at,
    stale: row.computed_at < Math.floor(now / 3600000) * 3600,
  };
}

export async function refreshDemoScene(
  env: Pick<Bindings, "DB" | "MODELS">,
  scheduledTime: number,
) {
  const hour = Math.floor(scheduledTime / 3600000) * 3600;
  const claimed = await env.DB.prepare(
    "INSERT INTO sol_demo_scene(singleton,attempted_hour) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET attempted_hour=excluded.attempted_hour WHERE sol_demo_scene.attempted_hour<excluded.attempted_hour RETURNING singleton",
  )
    .bind(hour)
    .first();
  if (!claimed) return;
  const computed = await computeScene(env, "SOL", 800);
  if (!computed || computed === "insufficient") return;
  await env.DB.prepare(
    "UPDATE sol_demo_scene SET computed_at=?, model_name=?, location=?, buried=?, source_timestamp=? WHERE singleton=1 AND attempted_hour=?",
  )
    .bind(
      hour,
      computed.model,
      computed.placement.location,
      Number(computed.placement.buried),
      computed.sourceRange,
      hour,
    )
    .run();
}

export async function demoNews(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT ${NEWS_COLUMNS} FROM sol_demo_weekly_news WHERE asset='SOL'`,
    )
    .first<CachedNews>();
  return row ? newsPreview(row) : null;
}
