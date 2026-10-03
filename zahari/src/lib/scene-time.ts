export type SceneMood = "dawn" | "day" | "dusk" | "night";

export function moodForLocalHour(hour: number): SceneMood {
  if (hour >= 6 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 15) return "day";
  if (hour >= 15 && hour < 19) return "dusk";
  return "night";
}
