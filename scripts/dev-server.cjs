const fs = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { URL } = require("node:url");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
const port = Number(process.env.PORT || 8788);
const limitsFile = path.join(dataDir, "local-vote-limits.json");
const fanUploadIpFile = path.join(dataDir, "local-fan-upload-ip.json");
const fanFile = path.join(publicDir, "data", "fan-burgers.json");
const devEnv = {};

let fanUploadLibPromise;
function loadFanUploadLib() {
  if (!fanUploadLibPromise) {
    fanUploadLibPromise = import(pathToFileURL(path.join(root, "functions/_lib/fan-upload.js")));
  }
  return fanUploadLibPromise;
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/burgers") {
    serveFile(response, path.join(publicDir, "data", "burgers.json"));
    return;
  }

  if (url.pathname.startsWith("/api/image/")) {
    const imageKey = decodeURIComponent(url.pathname.replace(/^\/api\/image\/+/, ""));
    serveFile(response, path.join(publicDir, "images", imageKey));
    return;
  }

  if (url.pathname.startsWith("/share/")) {
    handleSharePage(url, response);
    return;
  }

  if (url.pathname === "/api/fan-burgers" && request.method === "GET") {
    serveFile(response, fanFile);
    return;
  }

  if (url.pathname === "/api/fan-burgers/status") {
    await handleFanUploadStatus(url, response, request);
    return;
  }

  if (url.pathname === "/api/fan-burgers" && request.method === "POST") {
    await handleFanSubmit(request, response);
    return;
  }

  if (url.pathname === "/api/vote/status") {
    handleStatus(url, response);
    return;
  }

  if (url.pathname === "/api/vote" && request.method === "POST") {
    await handleDuelVote(request, response, "official", path.join(publicDir, "data", "burgers.json"));
    return;
  }

  if (url.pathname === "/api/fan-vote" && request.method === "POST") {
    await handleDuelVote(request, response, "fan", fanFile);
    return;
  }

  if (url.pathname === "/api/bracket" && request.method === "POST") {
    await handleBracket(request, response);
    return;
  }

  const normalized = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(publicDir, normalized);
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  serveFile(response, fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(publicDir, "index.html"));
}).listen(port, () => {
  console.log(`Summer of Burgers running at http://localhost:${port}`);
});

function serveFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
}

function handleSharePage(url, response) {
  const [, , type = "official", id = ""] = url.pathname.split("/");
  const origin = `${url.protocol}//${url.host}`;
  const officialRows = readJson(path.join(publicDir, "data", "burgers.json"), []);
  const fanRows = readJson(fanFile, []);
  const item = type === "fan"
    ? fanRows.find((row) => row.id === id)
    : officialRows.find((row) => row.id === id);
  const title = type === "fan" ? item?.title || "Fan Burger Duel" : item?.caption || "Summer of Burgers pick";
  const cleanTitle = cleanShareTitle(title);
  const image = type === "fan"
    ? `${origin}/api/image/share/fan-generic.jpg`
    : `${origin}/api/image/share/${id}.jpg`;
  const description = `I voted in #SUMMEROFBURGERS. My pick: ${cleanTitle}. Make yours.`;
  const html = shareHtml({
    canonical: `${origin}/share/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    image,
    title: "I voted in #SUMMEROFBURGERS",
    description,
    siteUrl: origin
  });
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function shareHtml({ canonical, image, title, description, siteUrl }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(image)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(image)}">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(siteUrl)}">
  </head>
  <body>
    <p><a href="${escapeHtml(siteUrl)}">Open Summer of Burgers</a></p>
  </body>
</html>`;
}

async function handleStatus(url, response) {
  const voterId = String(url.searchParams.get("voterId") || "");
  const type = String(url.searchParams.get("type") || "official");
  const gate = normalizeVoteType(type);
  if (!gate || !validVoterId(voterId)) {
    sendJson(response, 400, { error: "Invalid vote status request" });
    return;
  }

  const limits = readJson(limitsFile, []);
  const voteDay = currentVoteDay();
  const voterHash = hashVoter(voterId);
  const used = limits.some((row) => row.vote_type === gate && row.vote_day === voteDay && row.voter_hash === voterHash);
  sendJson(response, 200, { type, gate, allowed: !used, voteDay, nextReset: nextResetIso() });
}

async function handleDuelVote(request, response, voteType, dataPath) {
  const body = await readBodyJson(request);
  const winnerId = String(body.winnerId || "");
  const loserId = String(body.loserId || "");
  const voterId = String(body.voterId || "");
  if (!winnerId || !loserId || winnerId === loserId || !validVoterId(voterId)) {
    sendJson(response, 400, { error: "Invalid vote" });
    return;
  }

  const limits = readJson(limitsFile, []);
  const voteDay = currentVoteDay();
  const voterHash = hashVoter(voterId);
  if (limits.some((row) => row.vote_type === voteType && row.vote_day === voteDay && row.voter_hash === voterHash)) {
    sendJson(response, 429, { error: "Daily vote already used", allowed: false, nextReset: nextResetIso() });
    return;
  }

  const rows = readJson(dataPath, []);
  const winner = rows.find((row) => row.id === winnerId);
  const loser = rows.find((row) => row.id === loserId);
  if (!winner || !loser) {
    sendJson(response, 404, { error: "Burger not found" });
    return;
  }

  const next = calculateElo(Number(winner.elo || 1500), Number(loser.elo || 1500));
  limits.push({ vote_type: voteType, vote_day: voteDay, voter_hash: voterHash, created_at: new Date().toISOString() });
  writeJson(limitsFile, limits);
  sendJson(response, 200, {
    winnerId,
    loserId,
    winnerElo: next.winnerAfter,
    loserElo: next.loserAfter,
    allowed: false,
    nextReset: nextResetIso()
  });
}

async function handleBracket(request, response) {
  const body = await readBodyJson(request);
  const championId = String(body.championId || "");
  const voterId = String(body.voterId || "");
  if (!championId || !validVoterId(voterId)) {
    sendJson(response, 400, { error: "Invalid bracket result" });
    return;
  }

  const limits = readJson(limitsFile, []);
  const voteDay = currentVoteDay();
  const voterHash = hashVoter(voterId);
  if (limits.some((row) => row.vote_type === "official" && row.vote_day === voteDay && row.voter_hash === voterHash)) {
    sendJson(response, 429, { error: "Daily bracket result already counted", allowed: false, nextReset: nextResetIso() });
    return;
  }

  limits.push({ vote_type: "official", vote_day: voteDay, voter_hash: voterHash, created_at: new Date().toISOString() });
  writeJson(limitsFile, limits);
  sendJson(response, 200, { championId, allowed: false, nextReset: nextResetIso() });
}

async function handleFanUploadStatus(url, response, request) {
  const lib = await loadFanUploadLib();
  const voterId = String(url.searchParams.get("voterId") || "");
  if (!lib.validVoterId(voterId)) {
    sendJson(response, 400, { error: "Valid voterId is required" });
    return;
  }

  const uploadDay = lib.currentUploadDay();
  const voterHash = await lib.hashVoter(voterId, devEnv);
  const ipHash = await lib.hashIp(lib.clientIp(request), devEnv);
  const limits = readJson(limitsFile, []);
  const ipLimits = readJson(fanUploadIpFile, []);

  const voterUsed = limits.some((row) => row.vote_type === lib.FAN_UPLOAD.voteType && row.vote_day === uploadDay && row.voter_hash === voterHash);
  const ipRow = ipLimits.find((row) => row.ip_hash === ipHash && row.upload_day === uploadDay);
  const ipUsed = ipRow && Number(ipRow.upload_count) >= lib.FAN_UPLOAD.maxIpPerDay;

  sendJson(response, 200, {
    allowed: !voterUsed && !ipUsed,
    reason: voterUsed ? "daily_voter" : ipUsed ? "daily_ip" : null,
    uploadDay,
    nextReset: lib.nextResetIso()
  });
}

async function handleFanSubmit(request, response) {
  const lib = await loadFanUploadLib();
  const tooLarge = lib.rejectOversizedBody({
    headers: { get: (name) => request.headers[name.toLowerCase()] }
  });
  if (tooLarge) {
    sendJson(response, 413, { error: "Upload is too large" });
    return;
  }

  const type = request.headers["content-type"] || "";
  if (!type.includes("multipart/form-data")) {
    sendJson(response, 400, { error: "Use multipart form data" });
    return;
  }

  const parts = parseMultipart(await readBodyBuffer(request), type);
  const voterId = cleanText(parts.voterId?.text || "");
  if (!lib.validVoterId(voterId)) {
    sendJson(response, 400, { error: "Valid browser token is required" });
    return;
  }

  const uploadDay = lib.currentUploadDay();
  const voterHash = await lib.hashVoter(voterId, devEnv);
  const ipHash = await lib.hashIp(lib.clientIp(request), devEnv);
  const limits = readJson(limitsFile, []);
  const ipLimits = readJson(fanUploadIpFile, []);

  if (limits.some((row) => row.vote_type === lib.FAN_UPLOAD.voteType && row.vote_day === uploadDay && row.voter_hash === voterHash)) {
    sendJson(response, 429, { error: "You already submitted a fan burger today. Come back tomorrow.", allowed: false, nextReset: lib.nextResetIso() });
    return;
  }

  const ipRow = ipLimits.find((row) => row.ip_hash === ipHash && row.upload_day === uploadDay);
  if (ipRow && Number(ipRow.upload_count) >= lib.FAN_UPLOAD.maxIpPerDay) {
    sendJson(response, 429, { error: "Too many uploads from this network today. Try again tomorrow.", allowed: false, nextReset: lib.nextResetIso() });
    return;
  }

  const title = cleanText(parts.title?.text || "Fan burger").slice(0, 72);
  const caption = cleanText(parts.caption?.text || "").slice(0, 240);
  const image = parts.image;
  if (!image?.data?.length) {
    sendJson(response, 400, { error: "Image is required" });
    return;
  }

  const bytes = new Uint8Array(image.data);
  const contentType = (image.contentType || "").split(";")[0].trim();
  const checked = lib.validateFanImage(bytes, contentType);
  if (!checked.ok) {
    sendJson(response, 400, { error: checked.error });
    return;
  }

  const hash = crypto.createHash("sha256").update(image.data).digest("hex");
  const rows = readJson(fanFile, []);
  if (rows.some((row) => row.image_hash === hash)) {
    sendJson(response, 409, { error: "That image was already submitted" });
    return;
  }

  const id = `fan-${crypto.randomUUID()}`;
  const imageName = `${id}.${checked.format.ext}`;
  const relative = `/images/fan/${imageName}`;
  fs.mkdirSync(path.join(publicDir, "images", "fan"), { recursive: true });
  fs.writeFileSync(path.join(publicDir, "images", "fan", imageName), image.data);

  limits.push({ vote_type: lib.FAN_UPLOAD.voteType, vote_day: uploadDay, voter_hash: voterHash, created_at: new Date().toISOString() });
  writeJson(limitsFile, limits);

  if (ipRow) ipRow.upload_count = Number(ipRow.upload_count || 0) + 1;
  else ipLimits.push({ ip_hash: ipHash, upload_day: uploadDay, upload_count: 1, created_at: new Date().toISOString() });
  writeJson(fanUploadIpFile, ipLimits);

  const burger = {
    id,
    title: title || "Fan burger",
    caption,
    image_key: `fan/${imageName}`,
    thumb_key: `fan/${imageName}`,
    image_url: relative,
    thumb_url: relative,
    image_hash: hash,
    elo: 1500,
    wins: 0,
    losses: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  rows.unshift(burger);
  writeJson(fanFile, rows);
  sendJson(response, 201, burger);
}

function readBodyJson(request) {
  return readBodyBuffer(request).then((buffer) => {
    try {
      return JSON.parse(buffer.toString("utf8"));
    } catch {
      return {};
    }
  });
}

function readBodyBuffer(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipart(body, contentType) {
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return {};
  const output = {};
  const marker = Buffer.from(`--${boundary}`);
  for (const part of splitBuffer(body, marker)) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString("utf8");
    let data = part.slice(headerEnd + 4);
    if (data.slice(0, 2).toString() === "\r\n") data = data.slice(2);
    if (data.slice(-2).toString() === "\r\n") data = data.slice(0, -2);
    if (data.slice(-2).toString() === "--") data = data.slice(0, -2);
    const name = header.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    output[name] = {
      text: data.toString("utf8"),
      data,
      contentType: header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]
    };
  }
  return output;
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index;
  while ((index = buffer.indexOf(delimiter, start)) !== -1) {
    if (index > start) parts.push(buffer.slice(start, index));
    start = index + delimiter.length;
  }
  if (start < buffer.length) parts.push(buffer.slice(start));
  return parts;
}

function sendJson(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function normalizeVoteType(type) {
  if (["official", "duel", "bracket"].includes(type)) return "official";
  if (["fan", "fan-duel"].includes(type)) return "fan";
  return "";
}

function hashVoter(voterId) {
  return crypto.createHash("sha256").update(`summer-of-burgers-dev-salt:${voterId}`).digest("hex");
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

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanShareTitle(value) {
  return String(value || "Today's pick").replace(/#\S+/g, "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
