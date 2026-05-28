CREATE TABLE IF NOT EXISTS fan_upload_ip_daily (
  ip_hash TEXT NOT NULL,
  upload_day TEXT NOT NULL,
  upload_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ip_hash, upload_day)
);

CREATE INDEX IF NOT EXISTS idx_fan_upload_ip_day ON fan_upload_ip_daily (upload_day);
