CREATE TABLE sol_demo_scene (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  attempted_hour INTEGER NOT NULL,
  computed_at INTEGER,
  model_name TEXT,
  location TEXT,
  buried INTEGER,
  source_timestamp TEXT
);
CREATE TABLE sol_demo_weekly_news (
  asset TEXT PRIMARY KEY CHECK (asset = 'SOL'),
  edition TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  highlight TEXT NOT NULL DEFAULT ''
);
-- Seed only if the saved story was published by a recorded Monday 9am run.
INSERT INTO sol_demo_weekly_news (asset,edition,title,summary,source_url,published_at,fetched_at)
SELECT n.asset,e.edition,n.title,n.summary,n.source_url,n.published_at,n.fetched_at
FROM news_cache n JOIN news_editions e ON e.asset=n.asset
WHERE n.asset='SOL' AND e.state='published'
  AND substr(e.edition,11)='/9'
  AND strftime('%w',substr(e.edition,1,10))='1'
  AND n.fetched_at>=e.created_at AND n.fetched_at<e.created_at+3600
  AND n.title<>'' AND n.summary<>'' AND n.source_url LIKE 'https://%'
  AND n.published_at<>''
ORDER BY e.created_at DESC LIMIT 1;
