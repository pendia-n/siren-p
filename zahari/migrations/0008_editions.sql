CREATE TABLE IF NOT EXISTS news_editions (
  edition TEXT NOT NULL,
  asset TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'running',
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(edition,asset)
);
CREATE INDEX IF NOT EXISTS news_editions_created ON news_editions(created_at);
ALTER TABLE news_cache ADD COLUMN highlight TEXT;
ALTER TABLE news_cache ADD COLUMN provider TEXT;
-- Only invalidate cached scenes from the superseded ST/1m rules.
DELETE FROM scene_cache;
