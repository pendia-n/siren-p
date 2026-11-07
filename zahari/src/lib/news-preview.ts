import { isAsset, type Asset } from "./catalog";
import { cleanText } from "./news";

export type CachedNews = {
  asset: string;
  title: string;
  summary: string;
  source_url: string;
  published_at: string;
  fetched_at: number;
  highlight: string;
};

export const NEWS_COLUMNS =
  "asset,title,summary,source_url,published_at,fetched_at,highlight";

export function newsPreview(row: CachedNews, full = false) {
  return {
    title: cleanText(row.title, 110),
    summary: cleanText(row.summary, full ? 420 : 160),
    url: row.source_url,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    highlight: full ? cleanText(row.highlight, 65) : "",
    preview: !full,
  };
}

// Only these internal destinations may survive a login/signup round trip.
export function newsReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/news\/([a-z]+)$/.exec(value);
  return match && isAsset(match[1].toUpperCase()) ? value : null;
}

export function newsAccess(
  member: {
    tier: string;
    status: string;
    current_period_end: number;
  } | null,
  now = Math.floor(Date.now() / 1000),
) {
  return Boolean(
    member &&
    member.status === "active" &&
    member.current_period_end > now &&
    ["five", "eight"].includes(member.tier),
  );
}

export function newsPath(asset: Asset) {
  return `/news/${asset.toLowerCase()}`;
}
