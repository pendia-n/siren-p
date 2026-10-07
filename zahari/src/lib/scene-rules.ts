export type SceneClass = "palace" | "plane" | "pontoon";
export type SceneLocation = "lowland" | "pacific" | "sky";
export type ScenePlacement = { location: SceneLocation; buried: boolean };
export type Observation = { deviation: number; sigma: number };

// Newest first. Mean consecutive change, not percentage change near zero.
export function meanChange(
  rows: Observation[],
  field: keyof Observation,
  size: number,
  offset = 0,
) {
  if (size < 2 || rows.length < offset + size)
    throw new Error("Insufficient observations");
  return (rows[offset][field] - rows[offset + size - 1][field]) / (size - 1);
}
// Same asset, same window size; previous rolling windows only, excluding current.
export function normalizedChange(
  rows: Observation[],
  field: keyof Observation,
  size: number,
) {
  if (rows.some((row) => !Number.isFinite(row[field])))
    throw new Error("Invalid observations");
  const current = meanChange(rows, field, size);
  const history: number[] = [];
  for (let offset = 1; offset + size <= rows.length; offset++)
    history.push(Math.abs(meanChange(rows, field, size, offset)));
  if (history.length < 30) throw new Error("Insufficient calibration history");
  history.sort((a, b) => a - b);
  const scale = history[Math.ceil(history.length * 0.9) - 1];
  return scale === 0
    ? Math.sign(current)
    : Math.max(-1, Math.min(1, current / scale));
}
export function modelIndexForScore(d: number, count: number) {
  if (!Number.isFinite(d) || ![3, 4, 6, 8].includes(count))
    throw new Error("Invalid model score");
  const thresholds: Record<number, number[]> = {
    3: [-1 / 3, 1 / 3],
    4: [-0.5, 0, 0.5],
    6: [-2 / 3, -1 / 3, 0, 1 / 3, 2 / 3],
    8: [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75],
  };
  const index = thresholds[count].findIndex((bound) => d < bound);
  return index < 0 ? count - 1 : index;
}
export function placementForScore(s: number, kind: SceneClass): ScenePlacement {
  if (!Number.isFinite(s)) throw new Error("Invalid location score");
  const band = s < -0.5 ? 0 : s < 0 ? 1 : s < 0.5 ? 2 : 3;
  const land = { location: "lowland", buried: false } as const;
  const buried = { location: "lowland", buried: true } as const;
  const sea = { location: "pacific", buried: false } as const;
  const sky = { location: "sky", buried: false } as const;
  return {
    palace: [land, buried, sea, sky],
    pontoon: [sea, land, buried, sky],
    plane: [sky, sea, land, buried],
  }[kind][band];
}
export const chooseModelIndex = (
  rows: Observation[],
  count: number,
  size: number,
) => modelIndexForScore(normalizedChange(rows, "deviation", size), count);
export const choosePlacement = (
  rows: Observation[],
  kind: SceneClass,
  size: number,
) => placementForScore(normalizedChange(rows, "sigma", size), kind);
