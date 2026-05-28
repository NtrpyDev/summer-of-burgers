export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "D1 binding missing" }, { status: 501 });

  const body = await request.json().catch(() => ({}));
  const winnerId = String(body.winnerId || "");
  const loserId = String(body.loserId || "");
  const voterId = String(body.voterId || "");
  if (!winnerId || !loserId || winnerId === loserId) {
    return Response.json({ error: "winnerId and loserId are required" }, { status: 400 });
  }
  if (!validVoterId(voterId)) {
    return Response.json({ error: "Valid voterId is required" }, { status: 400 });
  }

  const rows = await env.DB.prepare("SELECT id, elo FROM fan_burgers WHERE approved = 1 AND id IN (?, ?)").bind(winnerId, loserId).all();
  const winner = rows.results.find((row) => row.id === winnerId);
  const loser = rows.results.find((row) => row.id === loserId);
  if (!winner || !loser) return Response.json({ error: "Fan burger not found" }, { status: 404 });

  const voteDay = currentVoteDay();
  const voterHash = await hashVoter(voterId, env);
  const next = calculateElo(Number(winner.elo || 1500), Number(loser.elo || 1500));

  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO daily_vote_limits (vote_type, vote_day, voter_hash) VALUES ('fan', ?, ?)").bind(voteDay, voterHash),
      env.DB.prepare("UPDATE fan_burgers SET elo = ?, wins = wins + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.winnerAfter, winnerId),
      env.DB.prepare("UPDATE fan_burgers SET elo = ?, losses = losses + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.loserAfter, loserId),
      env.DB.prepare(`
        INSERT INTO fan_head_to_head_votes
        (voter_hash, vote_day, winner_id, loser_id, winner_elo_before, loser_elo_before, winner_elo_after, loser_elo_after)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(voterHash, voteDay, winnerId, loserId, winner.elo, loser.elo, next.winnerAfter, next.loserAfter)
    ]);
  } catch (error) {
    if (isLimitError(error)) {
      return Response.json({ error: "Daily fan vote already used", allowed: false, nextReset: nextResetIso() }, { status: 429 });
    }
    throw error;
  }

  return Response.json({
    winnerId,
    loserId,
    winnerElo: next.winnerAfter,
    loserElo: next.loserAfter,
    allowed: false,
    nextReset: nextResetIso()
  });
}

function calculateElo(winnerElo, loserElo) {
  const k = 32;
  const winnerExpected = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const loserExpected = 1 / (1 + 10 ** ((winnerElo - loserElo) / 400));
  return {
    winnerAfter: winnerElo + k * (1 - winnerExpected),
    loserAfter: loserElo + k * (0 - loserExpected)
  };
}

function validVoterId(value) {
  return /^[a-zA-Z0-9_-]{24,96}$/.test(value);
}

async function hashVoter(voterId, env) {
  const salt = env.VOTE_SALT || "summer-of-burgers-dev-salt";
  const bytes = new TextEncoder().encode(`${salt}:${voterId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function currentVoteDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function nextResetIso() {
  const now = new Date();
  const easternNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const easternReset = new Date(easternNow);
  easternReset.setDate(easternReset.getDate() + 1);
  easternReset.setHours(0, 0, 0, 0);
  return easternReset.toISOString();
}

function isLimitError(error) {
  return String(error?.message || error).toLowerCase().includes("unique");
}
