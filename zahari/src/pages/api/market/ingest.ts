import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { isAsset } from "../../../lib/product";

type Row = {
  table: string;
  asset: string;
  gap: string;
  id: number;
  timestamp: string;
  x: number;
  deviation: number;
  sigma: number;
  h: number;
  e: number;
  close: number;
};
const gaps = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
]);
const safe = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);

export const POST: APIRoute = async ({ request }) => {
  if (!bindings.ZAHARI_INGEST_SECRET)
    return new Response(null, { status: 503 });
  const timestamp = Number(request.headers.get("X-Zahari-Timestamp"));
  const supplied = request.headers.get("X-Zahari-Signature") ?? "";
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300 ||
    !/^[a-f0-9]{64}$/.test(supplied)
  )
    return new Response(null, { status: 401 });
  const body = await request.text();
  if (body.length > 150_000) return new Response(null, { status: 413 });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(bindings.ZAHARI_INGEST_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${body}`),
    ),
  );
  const expected = Array.from(mac, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  if (
    supplied
      .split("")
      .reduce(
        (diff, char, index) =>
          diff | (char.charCodeAt(0) ^ expected.charCodeAt(index)),
        0,
      ) !== 0
  )
    return new Response(null, { status: 401 });
  let rows: Row[];
  try {
    rows = JSON.parse(body).rows;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > 100 ||
    rows.some(
      (row) =>
        !row ||
        !["st", "lt"].includes(row.table) ||
        !isAsset(row.asset) ||
        !gaps.has(row.gap) ||
        !Number.isSafeInteger(row.id) ||
        row.id < 1 ||
        typeof row.timestamp !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(row.timestamp) ||
        ![row.x, row.deviation, row.sigma, row.h, row.e, row.close].every(safe),
    )
  )
    return new Response(null, { status: 400 });
  const statement = bindings.DB.prepare(
    "INSERT INTO market_rows(source_table,asset,gap,source_id,source_timestamp,x,deviation,sigma,h,e,close) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_table,source_id) DO UPDATE SET source_timestamp=excluded.source_timestamp,x=excluded.x,deviation=excluded.deviation,sigma=excluded.sigma,h=excluded.h,e=excluded.e,close=excluded.close",
  );
  await bindings.DB.batch(
    rows.map((row) =>
      statement.bind(
        row.table,
        row.asset,
        row.gap,
        row.id,
        row.timestamp,
        row.x,
        row.deviation,
        row.sigma,
        row.h,
        row.e,
        row.close,
      ),
    ),
  );
  for (const group of new Set(
    rows.map((row) => `${row.table}:${row.asset}:${row.gap}`),
  )) {
    const [table, asset, gap] = group.split(":");
    await bindings.DB.prepare(
      "DELETE FROM market_rows WHERE source_table=? AND asset=? AND gap=? AND source_id<(SELECT MIN(source_id) FROM (SELECT source_id FROM market_rows WHERE source_table=? AND asset=? AND gap=? ORDER BY source_id DESC LIMIT 900))",
    )
      .bind(table, asset, gap, table, asset, gap)
      .run();
  }
  return Response.json(
    { accepted: rows.length },
    { headers: { "Cache-Control": "no-store" } },
  );
};
