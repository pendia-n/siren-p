import { bindings } from "./runtime";
import type { Tier } from "./stripe";
import type { Asset } from "./catalog";
import { PLAN_SECONDS, PLAN_WINDOWS } from "./catalog";
import { computeScene } from "./scene-compute";

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
  const computed = await computeScene(bindings, asset, window[tier]);
  if (computed === "insufficient") return null;
  if (!computed) return cached ? { ...cached, stale: true } : null;
  const { model, placement, sourceRange } = computed;
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
