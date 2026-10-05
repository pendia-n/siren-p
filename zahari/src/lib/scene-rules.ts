export type SceneClass = "palace" | "plane" | "pontoon";
export type SceneLocation = "lowland" | "pacific" | "sky";
export type ScenePlacement = { location: SceneLocation; buried: boolean };
export type Observation = { x: number; deviation: number; sigma: number };

export function percentile(values: number[], value: number) {
  if (!values.length) throw new Error("No observations");
  return values.filter((item) => item <= value).length / values.length;
}

export function chooseModelIndex(rows: Observation[], modelCount: number) {
  if (!rows.length || modelCount < 1)
    throw new Error("Scene requires observations and models");
  const x = percentile(
    rows.map((row) => row.x),
    rows[0].x,
  );
  const deviation = percentile(
    rows.map((row) => row.deviation),
    rows[0].deviation,
  );
  return Math.min(
    modelCount - 1,
    Math.floor(((x + deviation) / 2) * modelCount),
  );
}

export function choosePlacement(
  rows: Observation[],
  sceneClass: SceneClass,
): ScenePlacement {
  if (!rows.length) throw new Error("Scene requires observations");
  const sigma = percentile(
    rows.map((row) => row.sigma),
    rows[0].sigma,
  );
  const band = sigma >= 0.75 ? 0 : sigma >= 0.5 ? 1 : sigma >= 0.25 ? 2 : 3;
  const placement: Record<SceneClass, ScenePlacement[]> = {
    palace: [
      { location: "sky", buried: false },
      { location: "pacific", buried: false },
      { location: "lowland", buried: true },
      { location: "lowland", buried: false },
    ],
    pontoon: [
      { location: "sky", buried: false },
      { location: "lowland", buried: true },
      { location: "lowland", buried: false },
      { location: "pacific", buried: false },
    ],
    plane: [
      { location: "lowland", buried: true },
      { location: "lowland", buried: false },
      { location: "pacific", buried: false },
      { location: "sky", buried: false },
    ],
  };
  return placement[sceneClass][band];
}
