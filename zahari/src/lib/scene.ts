import { bindings } from "./runtime";
import type { Tier } from "./stripe";
import { MODEL_COUNTS, type Asset } from "./product";
import { chooseModelIndex, choosePlacement } from "./scene-rules";
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
  shortid: number;
  deviation: number;
  sigma: number;
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
  const rows = (
    await bindings.DB.prepare(
      "SELECT shortid,deviation,sigma FROM localtod_st_15m WHERE asset=? ORDER BY shortid DESC LIMIT 2200",
    )
      .bind(asset)
      .all<Row>()
  ).results;
  if (
    rows.length < window[tier] + 30 ||
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
  const index = chooseModelIndex(rows, MODEL_COUNTS[asset], window[tier]);
  const numbered = models.find((item) =>
    item.key.endsWith(`_${String(index + 1).padStart(2, "0")}.glb`),
  );
  if (!numbered) return cached ? { ...cached, stale: true } : null;
  const model = numbered.key.split("/").at(-1)!;
  const placement = choosePlacement(rows, SCENE_CLASSES[asset], window[tier]);
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
      `row:${latest.shortid}`,
      now,
      expires,
    )
    .run();
  return {
    model_name: model,
    location: placement.location,
    buried: Number(placement.buried),
    source_timestamp: `row:${latest.shortid}`,
    computed_at: now,
    expires_at: expires,
    stale: false,
  };
}
