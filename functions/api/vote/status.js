import {
  currentVoteDay,
  hashVoteVoter,
  nextResetIso,
  normalizeVoteType,
  resolveVoterIdentity,
  responseWithVoterCookie
} from "../../_lib/voting.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "D1 binding missing" }, { status: 501 });

  const url = new URL(request.url);
  const voterId = String(url.searchParams.get("voterId") || "");
  const requestedType = String(url.searchParams.get("type") || "official");
  const type = normalizeVoteType(requestedType);
  if (!type) return Response.json({ error: "Invalid vote type" }, { status: 400 });

  const identity = await resolveVoterIdentity(request, env, voterId);
  const voteDay = currentVoteDay();
  const voterHash = await hashVoteVoter(identity.voterId, env);
  const row = await env.DB.prepare("SELECT 1 FROM daily_vote_limits WHERE vote_type = ? AND vote_day = ? AND voter_hash = ?")
    .bind(type, voteDay, voterHash)
    .first();

  return responseWithVoterCookie({
    type: requestedType,
    gate: type,
    allowed: !row,
    voteDay,
    nextReset: nextResetIso()
  }, identity);
}
