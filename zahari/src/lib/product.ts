import { bindings } from "./runtime";
import { PLANS, type Tier } from "./stripe";

export const ASSETS = [
  "AAVE",
  "BNB",
  "BTC",
  "ETH",
  "LINK",
  "SOL",
  "UNI",
  "XAUT",
] as const;
export type Asset = (typeof ASSETS)[number];
export const isAsset = (value: string): value is Asset =>
  ASSETS.includes(value as Asset);

export async function membership(userId: string) {
  return bindings.DB.prepare(
    "SELECT tier,status,current_period_end,current_period_start FROM memberships WHERE user_id=?",
  )
    .bind(userId)
    .first<{
      tier: Tier;
      status: string;
      current_period_end: number;
      current_period_start: number;
    }>();
}
export function activeMembership(
  value: Awaited<ReturnType<typeof membership>>,
) {
  return Boolean(
    value &&
    ["active", "trialing"].includes(value.status) &&
    value.current_period_end > Math.floor(Date.now() / 1000),
  );
}
export async function ownsAsset(userId: string, asset: Asset) {
  const member = await membership(userId);
  if (!activeMembership(member)) return false;
  const selected = await bindings.DB.prepare(
    "SELECT 1 FROM coin_selections WHERE user_id=? AND asset=?",
  )
    .bind(userId, asset)
    .first();
  return Boolean(selected);
}
export function slots(tier: Tier) {
  return PLANS[tier].slots;
}
