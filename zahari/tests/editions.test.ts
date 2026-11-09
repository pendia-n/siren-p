import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { WINDOW_CALIBRATION_SQL } from "../src/lib/scene-window";
import {
  modelIndexForScore,
  placementForScore,
  meanChange,
  normalizedChange,
  randomWindowOffset,
  calibratedWindowChange,
} from "../src/lib/scene-rules";
import {
  editionAt,
  decodeExa,
  decodeTavily,
  decodeFirecrawl,
} from "../src/lib/news";
import { PLAN_SECONDS, PLAN_WINDOWS, MODEL_COUNTS } from "../src/lib/catalog";
import { ASSETS } from "../src/lib/catalog";
import { runNewsEdition } from "../src/lib/news-jobs";
import {
  newsAccess,
  newsPreview,
  newsReturnPath,
  type CachedNews,
} from "../src/lib/news-preview";
import {
  searchTavilyCoin,
  searchExaCoin,
  searchFirecrawlCoin,
} from "../src/lib/news";
import type { Bindings } from "../src/lib/auth";
import { computeScene } from "../src/lib/scene-compute";
import { demoScene, demoNews, refreshDemoScene } from "../src/lib/sol-demo";
const demoMigration = readFileSync(
  new URL("../migrations/0010_sol_demo.sql", import.meta.url),
  "utf8",
);
test("exact inclusive model boundaries, all authored counts", () => {
  const cases: Record<number, number[]> = {
    3: [-1, -1 / 3, 1 / 3],
    4: [-1, -0.5, 0, 0.5],
    6: [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3],
    8: [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75],
  };
  for (const [count, bounds] of Object.entries(cases))
    bounds.forEach((bound, index) => {
      assert.equal(modelIndexForScore(bound, Number(count)), index);
      if (index)
        assert.equal(
          modelIndexForScore(bound - 1e-9, Number(count)),
          index - 1,
        );
    });
  assert.equal(modelIndexForScore(1, 8), 7);
  assert.throws(() => modelIndexForScore(NaN, 8));
  assert.equal(
    Object.values(MODEL_COUNTS).reduce((a, b) => a + b),
    45,
  );
  assert.deepEqual(PLAN_SECONDS, { one: 43200, five: 28800, eight: 14400 });
  assert.deepEqual(PLAN_WINDOWS, { one: 1100, five: 2200, eight: 3300 });
});

function newsFixture(migrate = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE memberships(user_id TEXT,tier TEXT,status TEXT,current_period_end INTEGER);
    CREATE TABLE coin_selections(user_id TEXT,asset TEXT);
    CREATE TABLE news_editions(edition TEXT,asset TEXT,provider TEXT,created_at INTEGER,state TEXT DEFAULT 'running',PRIMARY KEY(edition,asset));
    CREATE TABLE news_cache(asset TEXT PRIMARY KEY,title TEXT,summary TEXT,source_url TEXT,published_at TEXT,fetched_at INTEGER,visible_until INTEGER,next_search_at INTEGER,highlight TEXT,provider TEXT);
  `);
  if (migrate) db.exec(demoMigration);
  const env = {
    DB: {
      prepare(sql: string) {
        let args: any[] = [];
        const statement = {
          bind(...values: any[]) {
            args = values;
            return statement;
          },
          async all() {
            return { results: db.prepare(sql).all(...args) };
          },
          async first() {
            return db.prepare(sql).get(...args) ?? null;
          },
          async run() {
            return db.prepare(sql).run(...args);
          },
        };
        return statement;
      },
    },
    TAVILY_HELEN: "fixture-weekday",
    TAVILY_2024: "fixture-weekend",
    EXA_HELEN: "fixture-noon-weekday",
    EXA_2024: "fixture-noon-weekend",
    FIRECRAWL_HELEN: "fixture-backup",
  } as unknown as Bindings;
  const calls: {
    provider: string;
    asset: string;
    key?: string;
    range?: string;
  }[] = [];
  let mode: "new" | "empty" | "failure" | "backup" = "new";
  const response =
    (provider: string) =>
    async (
      asset: any,
      key: string | undefined,
      date = new Date(),
      range: "day" | "week" = "day",
    ) => {
      calls.push({ provider, asset, key, range });
      if (mode === "failure" || (mode === "backup" && provider !== "firecrawl"))
        throw new Error("Fixture failure");
      return mode === "empty"
        ? null
        : {
            title: `${asset} material update`,
            summary: `${asset} has a source-backed update.`,
            url: `https://example.org/${asset}`,
            publishedAt: date.toISOString(),
            highlight: "",
            provider: provider as "tavily" | "exa" | "firecrawl",
          };
    };
  const searches = {
    searchTavilyCoin: response("tavily"),
    searchExaCoin: response("exa"),
    searchFirecrawlCoin: response("firecrawl"),
  };
  function member(
    user: string,
    tier: string,
    assets: string[],
    status = "active",
    expires = 9999999999,
  ) {
    db.prepare("INSERT INTO memberships VALUES(?,?,?,?)").run(
      user,
      tier,
      status,
      expires,
    );
    for (const asset of assets)
      db.prepare("INSERT INTO coin_selections VALUES(?,?)").run(user, asset);
  }
  return {
    db,
    env,
    calls,
    searches,
    member,
    mode: (value: typeof mode) => {
      mode = value;
    },
  };
}

test("no paid users: only Monday 9am searches all eight, seven-day range, once per coin", async () => {
  const f = newsFixture();
  try {
    for (const date of [
      "2026-11-08T14:00:00Z",
      "2026-11-09T18:00:00Z",
      "2026-11-10T02:00:00Z",
    ])
      await runNewsEdition(f.env, new Date(date), f.searches);
    assert.equal(f.calls.length, 0);
    const monday = new Date("2026-11-09T14:00:00Z");
    await runNewsEdition(f.env, monday, f.searches);
    assert.deepEqual(
      f.calls.map((c) => c.asset),
      [...ASSETS],
    );
    assert.ok(
      f.calls.every(
        (c) =>
          c.range === "week" &&
          c.provider === "tavily" &&
          c.key === "fixture-weekday",
      ),
    );
    await runNewsEdition(f.env, monday, f.searches);
    assert.equal(f.calls.length, 8);
    assert.equal(editionAt(new Date("2026-07-06T13:00:00Z"))?.weekly, true);
    assert.equal(editionAt(new Date("2026-07-06T17:00:00Z"))?.weekly, false);
  } finally {
    f.db.close();
  }
});

test("paid searches deduplicate selected coins, skip inactive/expired/One, preserve provider keys", async () => {
  const f = newsFixture();
  try {
    f.member("a", "five", ["BTC", "SOL"]);
    f.member("b", "eight", ["BTC"]);
    f.member("c", "five", ["LINK"], "canceled");
    f.member("d", "eight", ["ETH"], "active", 1);
    f.member("e", "one", ["UNI"]);
    for (const date of [
      "2026-11-10T14:00:00Z",
      "2026-11-10T18:00:00Z",
      "2026-11-11T02:00:00Z",
      "2026-11-14T14:00:00Z",
      "2026-11-14T18:00:00Z",
    ])
      await runNewsEdition(f.env, new Date(date), f.searches);
    assert.equal(f.calls.length, 10);
    assert.ok(
      f.calls.every(
        (c) => ["BTC", "SOL"].includes(c.asset) && c.range === "day",
      ),
    );
    assert.deepEqual(
      f.calls.filter((c) => c.asset === "BTC").map((c) => c.key),
      [
        "fixture-weekday",
        "fixture-noon-weekday",
        "fixture-weekday",
        "fixture-weekend",
        "fixture-noon-weekend",
      ],
    );
    f.calls.length = 0;
    await runNewsEdition(f.env, new Date("2026-11-16T14:00:00Z"), f.searches);
    assert.equal(f.calls.length, 8);
    assert.equal(f.calls.find((c) => c.asset === "BTC")?.range, "day");
    assert.deepEqual(
      f.calls.filter((c) => c.asset === "SOL").map((c) => c.range),
      ["week"],
    );
    assert.equal(f.calls.find((c) => c.asset === "UNI")?.range, "week");
  } finally {
    f.db.close();
  }
});

test("stories survive duplicate, empty and failed editions; backup only on a thrown failure", async () => {
  const f = newsFixture();
  try {
    f.member("a", "five", ["BTC"]);
    await runNewsEdition(f.env, new Date("2026-11-10T14:00:00Z"), f.searches);
    const before = f.db
      .prepare("SELECT * FROM news_cache WHERE asset='BTC'")
      .get()!;
    assert.equal(before.visible_until, 0);
    await runNewsEdition(f.env, new Date("2026-11-10T18:00:00Z"), f.searches);
    f.mode("empty");
    await runNewsEdition(f.env, new Date("2026-11-11T02:00:00Z"), f.searches);
    f.mode("failure");
    await runNewsEdition(f.env, new Date("2026-11-11T14:00:00Z"), f.searches);
    assert.deepEqual(
      f.db.prepare("SELECT * FROM news_cache WHERE asset='BTC'").get(),
      before,
    );
    assert.equal(f.calls.filter((c) => c.provider === "firecrawl").length, 1);
    assert.deepEqual(
      f.db
        .prepare("SELECT state FROM news_editions ORDER BY created_at")
        .all()
        .map((r) => r.state),
      ["published", "duplicate", "empty", "failed"],
    );
    f.mode("backup");
    await runNewsEdition(f.env, new Date("2026-11-11T18:00:00Z"), f.searches);
    assert.equal(f.calls.at(-1)?.key, "fixture-backup");
  } finally {
    f.db.close();
  }
});

test("public preview is truncated, full access checks expiry, return destination cannot escape", () => {
  const row = {
    title: "BTC news",
    summary: "Bitcoin context. ".repeat(28),
    source_url: "https://example.org/btc",
    published_at: "2026-11-01T12:00:00Z",
    fetched_at: 1,
    highlight: "Bitcoin context",
  } as CachedNews;
  assert.ok(newsPreview(row).summary.length <= 160);
  assert.equal(newsPreview(row).highlight, "");
  assert.equal(newsPreview(row).preview, true);
  assert.equal(newsPreview(row, true).preview, false);
  assert.ok(!("expiresAt" in newsPreview(row)));
  assert.equal(newsAccess(null, 100), false);
  for (const tier of ["five", "eight"]) {
    assert.equal(
      newsAccess({ tier, status: "active", current_period_end: 101 }, 100),
      true,
    );
    assert.equal(
      newsAccess({ tier, status: "active", current_period_end: 100 }, 100),
      false,
    );
  }
  assert.equal(
    newsAccess({ tier: "one", status: "active", current_period_end: 101 }, 100),
    false,
  );
  assert.equal(newsReturnPath("/news/btc"), "/news/btc");
  for (const bad of [
    "https://evil.test",
    "//evil.test",
    "/news/btc?next=//evil.test",
    "/news/unknown",
    "/news/../profile",
    null,
  ])
    assert.equal(newsReturnPath(bad), null);
});

test("weekly decoder accepts up to seven days, rejects older sources", () => {
  const date = new Date("2026-11-09T14:00:00Z");
  const item = {
    title: "Bitcoin adoption update",
    content: "Bitcoin has a material adoption update.",
    url: "https://example.org/btc",
    published_date: "2026-11-04T14:00:00Z",
  };
  assert.equal(decodeTavily({ results: [item] }, "BTC", date), null);
  assert.ok(decodeTavily({ results: [item] }, "BTC", date, "week"));
  assert.equal(
    decodeTavily(
      { results: [{ ...item, published_date: "2026-11-01T14:00:00Z" }] },
      "BTC",
      date,
      "week",
    ),
    null,
  );
});

test("provider request ranges use week filters without live network requests", async (t) => {
  const bodies: any[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      bodies.push(JSON.parse(String(options.body)));
      return Response.json({ results: [] });
    },
  );
  const date = new Date("2026-11-09T14:00:00Z");
  try {
    await searchTavilyCoin("BTC", "fixture-only", date, "week");
    await searchExaCoin("BTC", "fixture-only", date, "week");
    await searchFirecrawlCoin("BTC", "fixture-only", date, "week");
    assert.equal(bodies[0].time_range, "week");
    assert.equal(bodies[1].startPublishedDate, "2026-11-02T14:00:00.000Z");
    assert.equal(bodies[2].tbs, "qdr:w");
    assert.equal(bodies[0].max_results, 5);
  } finally {
    t.mock.restoreAll();
  }
});
test("random windows include first and last complete position and reject undersized data", () => {
  assert.equal(
    randomWindowOffset(4000, 3300, () => 0),
    0,
  );
  assert.equal(
    randomWindowOffset(4000, 3300, () => 0.999999),
    700,
  );
  assert.equal(
    randomWindowOffset(3300, 3300, () => 0.5),
    0,
  );
  assert.throws(() => randomWindowOffset(3299, 3300));
  const rows = [
    { deviation: 0.8, sigma: 0.2 },
    { deviation: 0.4, sigma: 0.4 },
  ];
  assert.equal(calibratedWindowChange(rows, "deviation", 0.8), 0.5);
  assert.equal(calibratedWindowChange(rows, "sigma", null), -1);
});
test("SQL windows use chronological positions across serial gaps and calibrate only the same asset", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE localtod_st_15m(id INTEGER PRIMARY KEY,asset TEXT,timestamp TEXT,deviation REAL,sigma REAL)",
    );
    const insert = db.prepare("INSERT INTO localtod_st_15m VALUES(?,?,?,?,?)");
    [0, 0.2, 0.4, 0.6, 0.8].forEach((d, i) =>
      insert.run(10 + i * 10, "BTC", `2026-09-26 00:00:0${i}`, d, 1 - d),
    );
    insert.run(99, "ETH", "2026-09-26 00:00:00", 100, 100);
    const rows = db
      .prepare(
        "SELECT id FROM localtod_st_15m WHERE asset=? ORDER BY timestamp,id LIMIT ? OFFSET ?",
      )
      .all("BTC", 3, 2);
    assert.deepEqual(
      rows.map((r) => r.id),
      [30, 40, 50],
    );
    const result = db.prepare(WINDOW_CALIBRATION_SQL).get(3, "BTC", 1)!;
    assert.ok(Math.abs(Number(result.deviation_scale) - 0.2) < 1e-12);
    assert.ok(Math.abs(Number(result.sigma_scale) - 0.2) < 1e-12);
    const exact = db.prepare(WINDOW_CALIBRATION_SQL).get(5, "BTC", 0)!;
    assert.equal(exact.deviation_scale, null);
    assert.equal(exact.sigma_scale, null);
  } finally {
    db.close();
  }
});
test("SOL demo shares the production calculator, claims one hourly run and retains a failed refresh", async () => {
  const { db, env } = newsFixture();
  try {
    db.exec(
      "CREATE TABLE localtod_st_15m(id INTEGER PRIMARY KEY,shortid INTEGER,asset TEXT,timestamp TEXT,deviation REAL,sigma REAL)",
    );
    const insert = db.prepare(
      "INSERT INTO localtod_st_15m VALUES(?,?,?,?,?,?)",
    );
    for (let i = 0; i < 801; i++)
      insert.run(i * 2, i * 10, "SOL", String(i).padStart(4, "0"), i, -i);
    insert.run(2000, 1, "BTC", "0000", 1e9, 1e9);
    const dbAdapter = Object.assign(env.DB, {
      batch: async (statements: D1PreparedStatement[]) =>
        Promise.all(statements.map((statement) => statement.all())),
    });
    let lists = 0;
    const fixture = {
      DB: dbAdapter,
      MODELS: {
        list: async () => {
          lists++;
          return {
            objects: Array.from({ length: 6 }, (_, i) => ({
              key: `sol/SOL_${String(i + 1).padStart(2, "0")}.glb`,
            })),
          };
        },
      } as unknown as R2Bucket,
    };
    const first = await computeScene(fixture, "SOL", 800, () => 0);
    const last = await computeScene(fixture, "SOL", 800, () => 0.9999);
    assert.deepEqual(first, {
      model: "SOL_06.glb",
      placement: { location: "sky", buried: false },
      sourceRange: "0000 through 0799",
    });
    assert.deepEqual(last, { ...first, sourceRange: "0001 through 0800" });
    assert.equal(await demoScene(dbAdapter), null);
    const hour = Date.parse("2026-11-09T14:00:00Z");
    await Promise.all([
      refreshDemoScene(fixture, hour),
      refreshDemoScene(fixture, hour),
    ]);
    assert.equal(lists, 3);
    const scene = await demoScene(dbAdapter, hour);
    assert.equal(scene?.location, "sky");
    assert.equal(scene?.computedAt, hour / 1000);
    assert.equal(scene?.stale, false);
    assert.deepEqual(await demoScene(dbAdapter, hour + 120000), scene);
    db.exec("DELETE FROM localtod_st_15m WHERE asset='SOL'");
    await refreshDemoScene(fixture, hour + 3600000);
    assert.deepEqual(await demoScene(dbAdapter, hour + 3600000), {
      ...scene,
      stale: true,
    });
    assert.equal(lists, 3);
  } finally {
    db.close();
  }
});

test("SOL weekly banner is independent of daily news and never expires", async () => {
  const f = newsFixture();
  try {
    f.member("a", "five", ["SOL"]);
    await runNewsEdition(f.env, new Date("2026-11-09T14:00:00Z"), f.searches);
    const original = await demoNews(f.env.DB);
    assert.equal(original?.publishedAt, "2026-11-09T14:00:00.000Z");
    assert.equal(original?.preview, true);
    await runNewsEdition(f.env, new Date("2026-11-09T18:00:00Z"), {
      ...f.searches,
      searchExaCoin: async () => ({
        title: "SOL daily story",
        summary: "Solana daily story",
        url: "https://example.org/daily",
        publishedAt: "2026-11-09T18:00:00Z",
        provider: "exa",
        highlight: "",
      }),
    });
    assert.equal(
      f.db.prepare("SELECT title FROM news_cache WHERE asset='SOL'").get()
        ?.title,
      "SOL daily story",
    );
    await runNewsEdition(f.env, new Date("2026-11-16T14:00:00Z"), f.searches);
    f.mode("failure");
    await runNewsEdition(f.env, new Date("2026-11-23T14:00:00Z"), f.searches);
    f.mode("empty");
    await runNewsEdition(f.env, new Date("2026-11-30T14:00:00Z"), f.searches);
    assert.deepEqual(await demoNews(f.env.DB), original);
  } finally {
    f.db.close();
  }
});

test("SOL demo migration seeds only a proven Monday edition", () => {
  for (const slot of ["9", "13"]) {
    const { db } = newsFixture(false);
    try {
      db.prepare("INSERT INTO news_editions VALUES(?,?,?,?,?)").run(
        `2026-11-09/${slot}`,
        "SOL",
        "tavily",
        100,
        "published",
      );
      db.exec(
        "INSERT INTO news_cache VALUES('SOL','Solana title','Solana summary','https://example.org/sol','2026-11-09',101,0,0,'','tavily')",
      );
      db.exec(demoMigration);
      assert.equal(
        Boolean(db.prepare("SELECT title FROM sol_demo_weekly_news").get()),
        slot === "9",
      );
    } finally {
      db.close();
    }
  }
});

test("location boundaries implement all three classes", () => {
  const expected = {
    palace: ["lowland:false", "lowland:true", "pacific:false", "sky:false"],
    pontoon: ["pacific:false", "lowland:false", "lowland:true", "sky:false"],
    plane: ["sky:false", "pacific:false", "lowland:false", "lowland:true"],
  };
  for (const kind of ["palace", "pontoon", "plane"] as const)
    [-1, -0.5, 0, 0.5].forEach((s, i) => {
      const p = placementForScore(s, kind);
      assert.equal(`${p.location}:${p.buried}`, expected[kind][i]);
    });
});
test("uses change rather than latest level; zero history is safe", () => {
  const rows = [
    { deviation: 0.6, sigma: 1 },
    { deviation: 0.4, sigma: 1 },
    { deviation: 0.2, sigma: 1 },
  ];
  assert.ok(Math.abs(meanChange(rows, "deviation", 3) - 0.2) < 1e-12);
  const flat = Array.from({ length: 2200 }, () => ({
    deviation: 0.8,
    sigma: 0.4,
  }));
  assert.equal(normalizedChange(flat, "deviation", 300), 0);
  assert.equal(
    normalizedChange(
      [{ deviation: 0.9, sigma: 0.4 }, ...flat],
      "deviation",
      300,
    ),
    1,
  );
  assert.throws(() => normalizedChange(rows, "sigma", 300));
});
test("New York keys at summer/winter times, no other slots", () => {
  assert.equal(
    editionAt(new Date("2026-10-08T13:00:00Z"))?.key,
    "TAVILY_HELEN",
  );
  assert.equal(editionAt(new Date("2026-10-08T17:00:00Z"))?.key, "EXA_HELEN");
  assert.equal(
    editionAt(new Date("2026-10-09T01:00:00Z"))?.key,
    "TAVILY_HELEN",
  );
  assert.equal(editionAt(new Date("2026-10-10T13:00:00Z"))?.key, "TAVILY_2024");
  assert.equal(editionAt(new Date("2026-10-10T17:00:00Z"))?.key, "EXA_2024");
  assert.equal(
    editionAt(new Date("2026-01-05T14:00:00Z"))?.key,
    "TAVILY_HELEN",
  );
  assert.equal(editionAt(new Date("2026-10-08T14:00:00Z")), null);
  assert.equal(editionAt(new Date("2026-10-08T13:05:00Z")), null);
});
// Offline fixtures only. No search function is invoked and no provider key is loaded.
const now = new Date("2026-10-08T13:00:00Z");
const item = {
  title: "Ethereum upgrade confirmed",
  url: "https://example.org/ethereum",
  content: "Ethereum developers confirmed an upgrade schedule.",
  published_date: "2026-10-08T12:00:00Z",
};
test("three response decoders normalize provider data, reject unsafe and stale sources", () => {
  assert.equal(decodeTavily({ results: [item] }, "ETH", now)?.url, item.url);
  assert.equal(
    decodeTavily(
      { results: [{ ...item, url: "javascript:alert(1)" }] },
      "ETH",
      now,
    ),
    null,
  );
  assert.equal(decodeTavily({ results: [item] }, "SOL", now), null);
  assert.equal(
    decodeTavily(
      { results: [{ ...item, published_date: "2020-01-01" }] },
      "ETH",
      now,
    ),
    null,
  );
  assert.equal(
    decodeFirecrawl(
      {
        success: true,
        data: {
          web: [{ ...item, summary: item.content, date: item.published_date }],
        },
      },
      "ETH",
      now,
    )?.provider,
    "firecrawl",
  );
  assert.equal(
    decodeExa(
      {
        results: [{ ...item, publishedDate: item.published_date }],
        output: {
          content: {
            title: item.title,
            summary: item.content,
            url: item.url,
            highlight: "upgrade schedule",
          },
        },
      },
      "ETH",
      now,
    )?.highlight,
    "upgrade schedule",
  );
  assert.equal(
    decodeExa(
      { results: [], output: { content: { ...item, summary: item.content } } },
      "ETH",
      now,
    ),
    null,
  );
});
