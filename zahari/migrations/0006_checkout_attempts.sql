CREATE TABLE checkout_attempts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  session_id TEXT
);
