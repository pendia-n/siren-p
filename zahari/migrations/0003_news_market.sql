CREATE TABLE news_cache (
  asset TEXT PRIMARY KEY,
  title TEXT,
  summary TEXT,
  source_url TEXT,
  published_at TEXT,
  fetched_at INTEGER NOT NULL DEFAULT 0,
  visible_until INTEGER NOT NULL DEFAULT 0,
  next_search_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE market_rows (
  source_table TEXT NOT NULL CHECK(source_table IN ('st','lt')),
  asset TEXT NOT NULL,
  gap TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  source_timestamp TEXT NOT NULL,
  x REAL,
  deviation REAL,
  sigma REAL,
  h REAL,
  e REAL,
  close REAL,
  PRIMARY KEY(source_table,source_id)
);
CREATE INDEX market_rows_asset_gap_time ON market_rows(asset,source_table,gap,source_timestamp DESC);
