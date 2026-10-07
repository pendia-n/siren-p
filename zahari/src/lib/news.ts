import type { Asset } from "./catalog";
export type Provider = "tavily" | "exa" | "firecrawl";
export type NewsSecrets = {
  TAVILY_HELEN?: string;
  TAVILY_2024?: string;
  EXA_HELEN?: string;
  EXA_2024?: string;
  FIRECRAWL_HELEN?: string;
};
export type Story = {
  title: string;
  summary: string;
  highlight: string;
  url: string;
  publishedAt: string;
  provider: Provider;
};
const names: Record<Asset, string> = {
  AAVE: "Aave AAVE",
  BNB: "BNB Binance BNB Chain",
  BTC: "Bitcoin BTC",
  ETH: "Ethereum ETH",
  LINK: "Chainlink LINK",
  SOL: "Solana SOL",
  UNI: "Uniswap UNI",
  XAUT: "Tether Gold XAUT",
};
const terms: Record<Asset, RegExp> = {
  AAVE: /\baave\b/i,
  BNB: /\bbnb\b|\bbinance\b/i,
  BTC: /\bbitcoin\b|\bbtc\b/i,
  ETH: /\bethereum\b|\beth\b|\bvitalik\b/i,
  LINK: /\bchainlink\b/i,
  SOL: /\bsolana\b/i,
  UNI: /\buniswap\b/i,
  XAUT: /\bxaut\b|\btether gold\b/i,
};
export function editionAt(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  if (parts.minute !== "00" || ![9, 13, 21].includes(hour)) return null;
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const provider = hour === 13 ? "exa" : "tavily";
  const key = (
    provider === "exa"
      ? weekend
        ? "EXA_2024"
        : "EXA_HELEN"
      : weekend
        ? "TAVILY_2024"
        : "TAVILY_HELEN"
  ) as keyof NewsSecrets;
  return {
    id: `${parts.year}-${parts.month}-${parts.day}/${hour}`,
    provider,
    key,
    hour,
    weekend,
  };
}
export const queryFor = (asset: Asset) =>
  `${names[asset]} latest material news: protocol upgrades, security incidents, regulation, lawsuits, institutional adoption, funding, partnerships and leadership. Exclude price predictions and sponsored promotions.`;
export function cleanText(value: unknown, max = 420): string {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/[*#`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const chunk = text.slice(0, max - 1);
  const stop = Math.max(chunk.lastIndexOf(". "), chunk.lastIndexOf("。"));
  return stop > max / 2
    ? chunk.slice(0, stop + 1)
    : chunk.slice(0, Math.max(chunk.lastIndexOf(" "), max / 2)) + "…";
}
function httpsUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function story(
  asset: Asset,
  item: any,
  provider: Provider,
  now: Date,
): Story | null {
  if (!item || typeof item !== "object") return null;
  const title = cleanText(item.title, 110),
    summary = cleanText(
      item.summary || item.content || item.snippet || item.description,
    );
  const url = httpsUrl(item.url);
  const published = Date.parse(
    item.publishedAt ||
      item.published_date ||
      item.publishedDate ||
      item.date ||
      "",
  );
  if (
    !title ||
    !summary ||
    !url ||
    !terms[asset].test(`${title} ${summary}`) ||
    !Number.isFinite(published) ||
    published > now.getTime() + 300000 ||
    published < now.getTime() - 48 * 3600000
  )
    return null;
  const candidate = cleanText(
    item.highlight || summary.split(" ").slice(0, 6).join(" "),
    65,
  );
  return {
    title,
    summary,
    url,
    publishedAt: new Date(published).toISOString(),
    provider,
    highlight: candidate && summary.includes(candidate) ? candidate : "",
  };
}
export function decodeTavily(
  raw: any,
  asset: Asset,
  now = new Date(),
): Story | null {
  const results = Array.isArray(raw?.results) ? raw.results : [];
  // A multi-source answer cannot safely be attributed to the first URL. Prefer that
  // source's own excerpt; use the generated answer only for a single-source response.
  for (const result of results) {
    const found = story(
      asset,
      {
        ...result,
        summary:
          results.length === 1 ? raw.answer || result.content : result.content,
      },
      "tavily",
      now,
    );
    if (found) return found;
  }
  return null;
}
export function decodeExa(
  raw: any,
  asset: Asset,
  now = new Date(),
): Story | null {
  const results = Array.isArray(raw?.results) ? raw.results : [];
  let output = raw?.output?.content;
  if (typeof output === "string") {
    try {
      output = JSON.parse(output);
    } catch {
      output = null;
    }
  }
  if (output && typeof output === "object") {
    const source = results.find(
      (r: any) => httpsUrl(r.url) === httpsUrl(output.url),
    );
    if (source) {
      const found = story(
        asset,
        { ...output, publishedAt: source.publishedDate },
        "exa",
        now,
      );
      if (found) return found;
    }
  }
  for (const result of results) {
    const found = story(
      asset,
      {
        ...result,
        summary: result.summary || result.highlights?.join(" ") || result.text,
      },
      "exa",
      now,
    );
    if (found) return found;
  }
  return null;
}
export function decodeFirecrawl(
  raw: any,
  asset: Asset,
  now = new Date(),
): Story | null {
  if (raw?.success === false) return null;
  const data = raw?.data ?? raw;
  const results = Array.isArray(data)
    ? data
    : [
        ...(Array.isArray(data?.news) ? data.news : []),
        ...(Array.isArray(data?.web) ? data.web : []),
      ];
  for (const result of results) {
    const found = story(
      asset,
      {
        ...result,
        publishedAt:
          result.publishedDate ||
          result.date ||
          result.metadata?.publishedTime ||
          result.metadata?.published_time ||
          result.metadata?.["article:published_time"],
      },
      "firecrawl",
      now,
    );
    if (found) return found;
  }
  return null;
}
async function post(
  url: string,
  key: string | undefined,
  body: unknown,
  exa = false,
) {
  if (!key) throw new Error("NEWS_CONFIGURATION");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(exa ? { "x-api-key": key } : { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`NEWS_HTTP_${response.status}`);
  return response.json();
}
export async function searchTavilyCoin(
  asset: Asset,
  key: string | undefined,
  now = new Date(),
) {
  const raw = await post("https://api.tavily.com/search", key, {
    query: queryFor(asset),
    topic: "news",
    search_depth: "advanced",
    time_range: "day",
    max_results: 5,
    include_answer: "advanced",
    include_published_date: true,
    include_raw_content: false,
    include_images: false,
    include_usage: true,
    auto_parameters: false,
  });
  return decodeTavily(raw, asset, now);
}
export async function searchExaCoin(
  asset: Asset,
  key: string | undefined,
  now = new Date(),
) {
  const raw = await post(
    "https://api.exa.ai/search",
    key,
    {
      query: queryFor(asset),
      type: "deep",
      category: "news",
      numResults: 10,
      startPublishedDate: new Date(now.getTime() - 86400000).toISOString(),
      contents: { highlights: true },
      systemPrompt:
        "Select ONE material new event about the requested asset. Write English: short factual title, summary of at most two sentences and 60 words, optional highlight copied verbatim from summary, and the exact supporting source URL. Do not invent facts or infer price direction.",
      outputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          highlight: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "summary", "url"],
      },
    },
    true,
  );
  return decodeExa(raw, asset, now);
}
export async function searchFirecrawlCoin(
  asset: Asset,
  key: string | undefined,
  now = new Date(),
) {
  const raw = await post("https://api.firecrawl.dev/v2/search", key, {
    query: queryFor(asset),
    sources: ["web"],
    limit: 3,
    tbs: "qdr:d",
    scrapeOptions: {
      onlyMainContent: true,
      maxAge: 3600000,
      formats: ["summary"],
    },
  });
  return decodeFirecrawl(raw, asset, now);
}
