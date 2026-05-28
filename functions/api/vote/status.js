export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "D1 binding missing" }, { status: 501 });

  const url = new URL(request.url);
  const voterId = String(url.searchParams.get("voterId") || "");
  const requestedType = String(url.searchParams.get("type") || "official");
  const type = normalizeVoteType(requestedType);
  if (!type) return Response.json({ error: "Invalid vote type" }, { status: 400 });
  if (!validVoterId(voterId)) return Response.json({ error: "Valid voterId is required" }, { status: 400 });

  const voteDay = currentVoteDay();
  const voterHash = await hashVoter(voterId, env);
  const row = await env.DB.prepare("SELECT 1 FROM daily_vote_limits WHERE vote_type = ? AND vote_day = ? AND voter_hash = ?")
    .bind(type, voteDay, voterHash)
    .first();

  return Response.json({
    type: requestedType,
    gate: type,
    allowed: !row,
    voteDay,
    nextReset: nextResetIso()
  });
}

function normalizeVoteType(type) {
  if (["official", "duel"].includes(type)) return "official";
  if (["fan", "fan-duel"].includes(type)) return "fan";
  return "";
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
