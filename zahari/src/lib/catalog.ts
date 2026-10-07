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
export const MODEL_COUNTS: Record<Asset, number> = {
  AAVE: 4,
  BNB: 6,
  BTC: 8,
  ETH: 8,
  LINK: 6,
  SOL: 6,
  UNI: 4,
  XAUT: 3,
};
export const SUBJECTS: Record<Asset, string> = {
  AAVE: "Regional jet",
  BNB: "Villa",
  BTC: "Fortress",
  ETH: "Castle",
  LINK: "Château",
  SOL: "Water bomber",
  UNI: "Jumbo jet",
  XAUT: "Cabin cruiser",
};
export const SCENE_CLASSES = {
  AAVE: "plane",
  BNB: "palace",
  BTC: "palace",
  ETH: "palace",
  LINK: "palace",
  SOL: "plane",
  UNI: "plane",
  XAUT: "pontoon",
} as const;
export const isAsset = (value: string): value is Asset =>
  ASSETS.includes(value as Asset);
export const PLAN_WINDOWS = { one: 300, five: 600, eight: 900 } as const;
export const PLAN_SECONDS = { one: 43200, five: 28800, eight: 14400 } as const;
