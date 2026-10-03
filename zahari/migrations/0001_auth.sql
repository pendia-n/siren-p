CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT,
  credential_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE recovery_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX recovery_user ON recovery_grants(user_id);
CREATE TABLE password_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_at INTEGER NOT NULL
);
CREATE INDEX password_changes_user_time ON password_changes(user_id, changed_at);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
-- Credential changes and revocation are one atomic transaction.
CREATE TRIGGER password_changed AFTER UPDATE OF password_hash ON users
WHEN OLD.password_hash != NEW.password_hash
BEGIN
  DELETE FROM sessions WHERE user_id = NEW.id;
  DELETE FROM recovery_grants WHERE user_id = NEW.id;
  INSERT INTO password_changes (user_id, changed_at) VALUES (NEW.id, unixepoch());
END;
CREATE TRIGGER recovery_changed AFTER UPDATE OF recovery_hash ON users
WHEN OLD.recovery_hash IS NOT NEW.recovery_hash
BEGIN
  DELETE FROM recovery_grants WHERE user_id = NEW.id;
END;
