const EASTERN_TIME_ZONE = "America/New_York";
const VOTER_COOKIE = "sob_voter";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_SALT = "summer-of-burgers-dev-salt";
const VOTE_IP_LIMITS = {
  official: 20,
  fan: 20
};

export function validVoterId(value) {
  return /^[a-zA-Z0-9_-]{24,96}$/.test(value);
}

export function normalizeVoteType(type) {
  if (["official", "duel", "bracket"].includes(type)) return "official";
  if (["fan", "fan-duel"].includes(type)) return "fan";
  return "";
}

export function calculateElo(winnerElo, loserElo) {
  const k = 32;
  const winnerExpected = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const loserExpected = 1 / (1 + 10 ** ((winnerElo - loserElo) / 400));
  return {
    winnerAfter: winnerElo + k * (1 - winnerExpected),
    loserAfter: loserElo + k * (0 - loserExpected)
  };
}

export async function resolveVoterIdentity(request, env, clientVoterId = "") {
  const cookie = parseCookies(request.headers.get("cookie") || "")[VOTER_COOKIE];
  const cookieVoterId = await verifySignedVoter(cookie, env);
  const fallbackVoterId = validVoterId(clientVoterId)
    ? clientVoterId
    : crypto.randomUUID().replace(/-/g, "");
  const voterId = cookieVoterId || fallbackVoterId;
  return {
    voterId,
    setCookie: cookieVoterId ? "" : await signedVoterCookie(voterId, request, env)
  };
}

export function responseWithVoterCookie(data, identity, init = {}) {
  const headers = new Headers(init.headers || {});
  if (identity?.setCookie) headers.append("set-cookie", identity.setCookie);
  return Response.json(data, { ...init, headers });
}

export async function hashVoteVoter(voterId, env) {
  return sha256Hex(`${salt(env)}:${voterId}`);
}

export async function hashIp(ip, env) {
  return sha256Hex(`${salt(env)}:ip:${ip}`);
}

export function clientIp(request) {
  const header = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const ip = header.split(",")[0].trim();
  return ip || "local-dev";
}

export async function getVoteIpGate(env, request, voteType) {
  const maxVotes = VOTE_IP_LIMITS[voteType] || 20;
  const voteDay = currentVoteDay();
  const ipHash = await hashIp(clientIp(request), env);
  let row = null;
  try {
    row = await env.DB.prepare(
      "SELECT vote_count FROM vote_ip_daily WHERE vote_type = ? AND vote_day = ? AND ip_hash = ?"
    ).bind(voteType, voteDay, ipHash).first();
  } catch (error) {
    if (isMissingVoteIpTable(error)) {
      return { allowed: true, voteType, voteDay, ipHash, skipIpRecord: true };
    }
    throw error;
  }

  if (row && Number(row.vote_count) >= maxVotes) {
    return {
      allowed: false,
      error: "Too many votes from this network today. Come back tomorrow.",
      nextReset: nextResetIso(),
      status: 429
    };
  }

  return { allowed: true, voteType, voteDay, ipHash };
}

export function recordVoteIpStatement(env, gate) {
  if (gate.skipIpRecord) return null;
  return env.DB.prepare(`
    INSERT INTO vote_ip_daily (vote_type, vote_day, ip_hash, vote_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(vote_type, vote_day, ip_hash)
    DO UPDATE SET vote_count = vote_count + 1, updated_at = CURRENT_TIMESTAMP
  `).bind(gate.voteType, gate.voteDay, gate.ipHash);
}

export function currentVoteDay(date = new Date()) {
  const parts = easternParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nextResetIso(date = new Date()) {
  const today = easternParts(date);
  const tomorrowNoonUtc = new Date(Date.UTC(
    Number(today.year),
    Number(today.month) - 1,
    Number(today.day) + 1,
    12
  ));
  const tomorrow = easternParts(tomorrowNoonUtc);
  const resetUtcMs = zonedMidnightUtcMs(
    Number(tomorrow.year),
    Number(tomorrow.month),
    Number(tomorrow.day)
  );
  return new Date(resetUtcMs).toISOString();
}

export function isLimitError(error) {
  return String(error?.message || error).toLowerCase().includes("unique");
}

function isMissingVoteIpTable(error) {
  const message = String(error?.message || error).toLowerCase();
  return message.includes("vote_ip_daily") && (
    message.includes("no such table") ||
    message.includes("does not exist")
  );
}

function easternParts(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
}

function zonedMidnightUtcMs(year, month, day) {
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = targetLocalAsUtc;
  for (let index = 0; index < 4; index += 1) {
    const parts = easternParts(new Date(guess));
    const actualLocalAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    guess -= actualLocalAsUtc - targetLocalAsUtc;
  }
  return guess;
}

async function signedVoterCookie(voterId, request, env) {
  const value = `${voterId}.${await hmacHex(salt(env), voterId)}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${VOTER_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly${secure}`;
}

async function verifySignedVoter(value, env) {
  if (!value) return "";
  const decoded = decodeURIComponent(value);
  const [voterId, signature] = decoded.split(".");
  if (!validVoterId(voterId) || !signature) return "";
  const expected = await hmacHex(salt(env), voterId);
  return timingSafeEqual(signature, expected) ? voterId : "";
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(signature);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function salt(env) {
  return env.VOTE_SALT || DEFAULT_SALT;
}
