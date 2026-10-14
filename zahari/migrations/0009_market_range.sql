DROP TABLE localtod_st_15m;
CREATE TABLE localtod_st_15m (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shortid INTEGER NOT NULL UNIQUE,
  deviation REAL NOT NULL,
  sigma REAL NOT NULL,
  asset TEXT NOT NULL CHECK(asset IN ('AAVE','BNB','BTC','ETH','LINK','SOL','UNI','XAUT')),
  close REAL NOT NULL,
  timestamp TEXT NOT NULL
);
CREATE INDEX localtod_st_15m_asset_time ON localtod_st_15m(asset,timestamp,id);
UPDATE scene_cache SET expires_at=0;
