CREATE TABLE localtod_st_15m (
  shortid INTEGER PRIMARY KEY,
  x REAL NOT NULL,
  deviation REAL NOT NULL,
  sigma REAL NOT NULL,
  e REAL NOT NULL,
  h REAL NOT NULL,
  asset TEXT NOT NULL CHECK(asset IN ('AAVE','BNB','BTC','ETH','LINK','SOL','UNI','XAUT'))
);
CREATE INDEX localtod_st_15m_asset_shortid ON localtod_st_15m(asset, shortid DESC);
