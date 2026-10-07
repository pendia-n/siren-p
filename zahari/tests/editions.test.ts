import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modelIndexForScore,
  placementForScore,
  meanChange,
  normalizedChange,
} from "../src/lib/scene-rules";
import {
  editionAt,
  decodeExa,
  decodeTavily,
  decodeFirecrawl,
} from "../src/lib/news";
import { PLAN_SECONDS, PLAN_WINDOWS, MODEL_COUNTS } from "../src/lib/catalog";
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
  assert.deepEqual(PLAN_WINDOWS, { one: 300, five: 600, eight: 900 });
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
