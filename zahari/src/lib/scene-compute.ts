import type { Bindings } from "./auth";
import { MODEL_COUNTS, type Asset } from "./catalog";
import {
  calibratedWindowChange,
  modelIndexForScore,
  placementForScore,
  randomWindowOffset,
} from "./scene-rules";
import { WINDOW_CALIBRATION_SQL } from "./scene-window";
import { SCENE_CLASSES } from "./catalog";

type Row = {
  id: number;
  shortid: number;
  deviation: number;
  sigma: number;
  timestamp: string;
};

export async function computeScene(
  env: Pick<Bindings, "DB" | "MODELS">,
  asset: Asset,
  size: number,
  random = Math.random,
) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM localtod_st_15m WHERE asset=?",
  )
    .bind(asset)
    .first<{ total: number }>();
  if (!count || count.total < size) return "insufficient" as const;
  const offset = randomWindowOffset(count.total, size, random);
  const [selected, calibration] = await env.DB.batch([
    env.DB.prepare(
      "SELECT id,shortid,deviation,sigma,timestamp FROM localtod_st_15m WHERE asset=? ORDER BY timestamp ASC,id ASC LIMIT ? OFFSET ?",
    ).bind(asset, size, offset),
    env.DB.prepare(WINDOW_CALIBRATION_SQL).bind(size, asset, offset),
  ]);
  // The rules expect newest first; the selected SQL window is chronological.
  const rows = (selected.results as Row[]).reverse();
  const scale = calibration.results[0] as {
    deviation_scale: number | null;
    sigma_scale: number | null;
  };
  if (
    rows.length !== size ||
    rows.some(
      (row) => !Number.isFinite(row.deviation) || !Number.isFinite(row.sigma),
    )
  )
    return null;
  const models = (
    await env.MODELS.list({
      prefix: `${asset.toLowerCase()}/`,
      limit: 100,
    })
  ).objects
    .filter((item) => item.key.endsWith(".glb"))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (models.length < MODEL_COUNTS[asset]) return null;
  const latest = rows[0];
  const index = modelIndexForScore(
    calibratedWindowChange(rows, "deviation", scale.deviation_scale),
    MODEL_COUNTS[asset],
  );
  const numbered = models.find((item) =>
    item.key.endsWith(`_${String(index + 1).padStart(2, "0")}.glb`),
  );
  if (!numbered) return null;
  const model = numbered.key.split("/").at(-1)!;
  const placement = placementForScore(
    calibratedWindowChange(rows, "sigma", scale.sigma_scale),
    SCENE_CLASSES[asset],
  );
  const sourceRange = `${rows.at(-1)!.timestamp} through ${latest.timestamp}`;
  return { model, placement, sourceRange };
}
