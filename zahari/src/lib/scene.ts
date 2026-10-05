import { bindings } from "./runtime";
import type { Tier } from "./stripe";
import { MODEL_COUNTS, type Asset } from "./product";
import { chooseModelIndex, choosePlacement } from "./scene-rules";

const cadence: Record<Tier, number> = { one: 14400, five: 5400, eight: 1320 };
const window: Record<Tier, number> = { one: 300, five: 600, eight: 900 };
const kind: Record<Asset, "palace" | "plane" | "pontoon"> = {
  AAVE: "plane",
  BNB: "palace",
  BTC: "palace",
  ETH: "palace",
  LINK: "palace",
  SOL: "plane",
  UNI: "plane",
  XAUT: "pontoon",
};
type Cache = {
  model_name: string;
  location: string;
  buried: number;
  source_timestamp: string;
  computed_at: number;
  expires_at: number;
};
type Row = {
  x: number;
  deviation: number;
  sigma: number;
  source_timestamp: string;
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
      stale: now - Date.parse(cached.source_timestamp) / 1000 > 1800,
    };
  const rows = (
    await bindings.DB.prepare(
      "SELECT x,deviation,sigma,source_timestamp FROM market_rows WHERE asset=? AND source_table='st' AND gap='1m' ORDER BY source_timestamp DESC LIMIT ?",
    )
      .bind(asset, window[tier])
      .all<Row>()
  ).results;
  if (
    rows.length < 30 ||
    now - Date.parse(rows[0].source_timestamp) / 1000 > 1800
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
  const model = models[chooseModelIndex(rows, models.length)].key
    .split("/")
    .at(-1)!;
  const placement = choosePlacement(rows, kind[asset]);
  const origin = startedAt > 0 ? startedAt : now;
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
      latest.source_timestamp,
      now,
      expires,
    )
    .run();
  return {
    model_name: model,
    location: placement.location,
    buried: Number(placement.buried),
    source_timestamp: latest.source_timestamp,
    computed_at: now,
    expires_at: expires,
    stale: false,
  };
}
