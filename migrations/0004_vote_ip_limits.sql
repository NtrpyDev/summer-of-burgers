CREATE TABLE IF NOT EXISTS vote_ip_daily (
  vote_type TEXT NOT NULL,
  vote_day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vote_type, vote_day, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_vote_ip_daily_day ON vote_ip_daily (vote_day, vote_type);
