import {
  calculateElo,
  currentVoteDay,
  getVoteIpGate,
  hashVoteVoter,
  isLimitError,
  nextResetIso,
  recordVoteIpStatement,
  resolveVoterIdentity,
  responseWithVoterCookie
} from "../_lib/voting.js";

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

  const rows = await env.DB.prepare("SELECT id, elo FROM fan_burgers WHERE approved = 1 AND id IN (?, ?)").bind(winnerId, loserId).all();
  const winner = rows.results.find((row) => row.id === winnerId);
  const loser = rows.results.find((row) => row.id === loserId);
  if (!winner || !loser) return Response.json({ error: "Fan burger not found" }, { status: 404 });

  const identity = await resolveVoterIdentity(request, env, voterId);
  const voteDay = currentVoteDay();
  const voterHash = await hashVoteVoter(identity.voterId, env);
  const ipGate = await getVoteIpGate(env, request, "fan");
  if (!ipGate.allowed) {
    return responseWithVoterCookie(
      { error: ipGate.error, allowed: false, nextReset: ipGate.nextReset },
      identity,
      { status: ipGate.status || 429 }
    );
  }
  const next = calculateElo(Number(winner.elo || 1500), Number(loser.elo || 1500));

  try {
    const voteIpStatement = recordVoteIpStatement(env, ipGate);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO daily_vote_limits (vote_type, vote_day, voter_hash) VALUES ('fan', ?, ?)").bind(voteDay, voterHash),
      ...(voteIpStatement ? [voteIpStatement] : []),
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
      return responseWithVoterCookie(
        { error: "Daily fan vote already used", allowed: false, nextReset: nextResetIso() },
        identity,
        { status: 429 }
      );
    }
    throw error;
  }

  return responseWithVoterCookie({
    winnerId,
    loserId,
    winnerElo: next.winnerAfter,
    loserElo: next.loserAfter,
    allowed: false,
    nextReset: nextResetIso()
  }, identity);
}
