-- One-time launch reset: clear all votes and daily limits, reset Elo to 1500.
DELETE FROM head_to_head_votes;
DELETE FROM fan_head_to_head_votes;
DELETE FROM bracket_runs;
DELETE FROM daily_vote_limits;
DELETE FROM vote_ip_daily;

UPDATE burgers SET
  elo = 1500,
  wins = 0,
  losses = 0,
  bracket_wins = 0,
  updated_at = CURRENT_TIMESTAMP;

UPDATE fan_burgers SET
  elo = 1500,
  wins = 0,
  losses = 0,
  updated_at = CURRENT_TIMESTAMP;
