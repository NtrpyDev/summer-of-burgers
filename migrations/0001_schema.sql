CREATE TABLE IF NOT EXISTS burgers (
  id TEXT PRIMARY KEY,
  tweet_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  posted_at TEXT,
  caption TEXT DEFAULT '',
  media_index INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  image_url TEXT,
  thumb_url TEXT,
  image_hash TEXT,
  perceptual_hash TEXT,
  category TEXT NOT NULL DEFAULT 'unknown',
  tags TEXT NOT NULL DEFAULT '[]',
  elo REAL NOT NULL DEFAULT 1500,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  bracket_wins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_burgers_tweet_media ON burgers (tweet_id, media_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_burgers_hash ON burgers (image_hash);
CREATE INDEX IF NOT EXISTS idx_burgers_posted_at ON burgers (posted_at);
CREATE INDEX IF NOT EXISTS idx_burgers_category ON burgers (category);

CREATE TABLE IF NOT EXISTS head_to_head_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_hash TEXT NOT NULL,
  vote_day TEXT NOT NULL,
  winner_id TEXT NOT NULL,
  loser_id TEXT NOT NULL,
  winner_elo_before REAL NOT NULL,
  loser_elo_before REAL NOT NULL,
  winner_elo_after REAL NOT NULL,
  loser_elo_after REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_votes_created_at ON head_to_head_votes (created_at);
CREATE INDEX IF NOT EXISTS idx_votes_voter_day ON head_to_head_votes (vote_day, voter_hash);

CREATE TABLE IF NOT EXISTS bracket_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_hash TEXT NOT NULL,
  vote_day TEXT NOT NULL,
  champion_id TEXT NOT NULL,
  burger_ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brackets_champion ON bracket_runs (champion_id);

CREATE TABLE IF NOT EXISTS daily_vote_limits (
  vote_type TEXT NOT NULL,
  vote_day TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vote_type, vote_day, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_daily_vote_limits_day ON daily_vote_limits (vote_day, vote_type);

CREATE TABLE IF NOT EXISTS fan_burgers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  caption TEXT DEFAULT '',
  image_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  image_url TEXT,
  thumb_url TEXT,
  image_hash TEXT,
  elo REAL NOT NULL DEFAULT 1500,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_burgers_hash ON fan_burgers (image_hash);
CREATE INDEX IF NOT EXISTS idx_fan_burgers_created_at ON fan_burgers (created_at);

CREATE TABLE IF NOT EXISTS fan_head_to_head_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_hash TEXT NOT NULL,
  vote_day TEXT NOT NULL,
  winner_id TEXT NOT NULL,
  loser_id TEXT NOT NULL,
  winner_elo_before REAL NOT NULL,
  loser_elo_before REAL NOT NULL,
  winner_elo_after REAL NOT NULL,
  loser_elo_after REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fan_votes_created_at ON fan_head_to_head_votes (created_at);
CREATE INDEX IF NOT EXISTS idx_fan_votes_voter_day ON fan_head_to_head_votes (vote_day, voter_hash);
