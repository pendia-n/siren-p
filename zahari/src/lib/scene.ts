import { bindings } from "./runtime";
import type { Tier } from "./stripe";
import { MODEL_COUNTS, type Asset } from "./product";
import {
  calibratedWindowChange,
  modelIndexForScore,
  placementForScore,
  randomWindowOffset,
} from "./scene-rules";
import { WINDOW_CALIBRATION_SQL } from "./scene-window";
import { PLAN_SECONDS, PLAN_WINDOWS, SCENE_CLASSES } from "./catalog";

const cadence = PLAN_SECONDS;
const window = PLAN_WINDOWS;
type Cache = {
  model_name: string;
  location: string;
  buried: number;
  source_timestamp: string;
  computed_at: number;
  expires_at: number;
};
type Row = {
  id: number;
  shortid: number;
  deviation: number;
  sigma: number;
  timestamp: string;
};

export async function sceneFor(
  userId: string,
  asset: Asset,
  tier: Tier,
  startedAt: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const cached = await bindings.DB.prepare(
    "SELECT model_name,location,buried,source_timestamp,computed_at,expires_at FROM scene_cache WHERE user_id=? AND asset=? AND tier=?",
  )
    .bind(userId, asset, tier)
    .first<Cache>();
  if (cached && cached.expires_at > now)
    return {
      ...cached,
      stale: false,
    };
  const count = await bindings.DB.prepare(
    "SELECT COUNT(*) AS total FROM localtod_st_15m WHERE asset=?",
  )
    .bind(asset)
    .first<{ total: number }>();
  if (!count || count.total < window[tier]) return null;
  const offset = randomWindowOffset(count.total, window[tier]);
  const [selected, calibration] = await bindings.DB.batch([
    bindings.DB.prepare(
      "SELECT id,shortid,deviation,sigma,timestamp FROM localtod_st_15m WHERE asset=? ORDER BY timestamp ASC,id ASC LIMIT ? OFFSET ?",
    ).bind(asset, window[tier], offset),
    bindings.DB.prepare(WINDOW_CALIBRATION_SQL).bind(
      window[tier],
      asset,
      offset,
    ),
  ]);
  // The rules expect newest first; the selected SQL window is chronological.
  const rows = (selected.results as Row[]).reverse();
  const scale = calibration.results[0] as {
    deviation_scale: number | null;
    sigma_scale: number | null;
  };
  if (
    rows.length !== window[tier] ||
    rows.some(
      (row) => !Number.isFinite(row.deviation) || !Number.isFinite(row.sigma),
    )
  )
    return cached ? { ...cached, stale: true } : null;
  const models = (
    await bindings.MODELS.list({
      prefix: `${asset.toLowerCase()}/`,
      limit: 100,
    })
  ).objects
    .filter((item) => item.key.endsWith(".glb"))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (models.length < MODEL_COUNTS[asset])
    return cached ? { ...cached, stale: true } : null;
  const latest = rows[0];
  const index = modelIndexForScore(
    calibratedWindowChange(rows, "deviation", scale.deviation_scale),
    MODEL_COUNTS[asset],
  );
  const numbered = models.find((item) =>
    item.key.endsWith(`_${String(index + 1).padStart(2, "0")}.glb`),
  );
  if (!numbered) return cached ? { ...cached, stale: true } : null;
  const model = numbered.key.split("/").at(-1)!;
  const placement = placementForScore(
    calibratedWindowChange(rows, "sigma", scale.sigma_scale),
    SCENE_CLASSES[asset],
  );
  const sourceRange = `${rows.at(-1)!.timestamp} through ${latest.timestamp}`;
  const selection = await bindings.DB.prepare(
    "SELECT selected_at FROM coin_selections WHERE user_id=? AND asset=?",
  )
    .bind(userId, asset)
    .first<{ selected_at: number }>();
  const origin = selection?.selected_at || (startedAt > 0 ? startedAt : now);
  const expires =
    origin + (Math.floor((now - origin) / cadence[tier]) + 1) * cadence[tier];
  await bindings.DB.prepare(
    "INSERT INTO scene_cache(user_id,asset,tier,model_name,location,buried,source_timestamp,computed_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,asset) DO UPDATE SET tier=excluded.tier,model_name=excluded.model_name,location=excluded.location,buried=excluded.buried,source_timestamp=excluded.source_timestamp,computed_at=excluded.computed_at,expires_at=excluded.expires_at",
  )
    .bind(
      userId,
      asset,
      tier,
      model,
      placement.location,
      Number(placement.buried),
      sourceRange,
      now,
      expires,
    )
    .run();
  return {
    model_name: model,
    location: placement.location,
    buried: Number(placement.buried),
    source_timestamp: sourceRange,
    computed_at: now,
    expires_at: expires,
    stale: false,
  };
}
