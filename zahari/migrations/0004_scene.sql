ALTER TABLE memberships ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE scene_cache (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  tier TEXT NOT NULL,
  model_name TEXT NOT NULL,
  location TEXT NOT NULL,
  buried INTEGER NOT NULL,
  source_timestamp TEXT NOT NULL,
  computed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,asset)
);
