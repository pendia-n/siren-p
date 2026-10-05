CREATE TABLE memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  tier TEXT NOT NULL CHECK(tier IN ('one','five','eight')),
  status TEXT NOT NULL,
  current_period_end INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE coin_selections (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  selected_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,asset)
);
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
