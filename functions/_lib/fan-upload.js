export const FAN_UPLOAD = {
  maxBytes: 6 * 1024 * 1024,
  minBytes: 4 * 1024,
  maxBodyBytes: 6 * 1024 * 1024 + 256 * 1024,
  maxWidth: 8192,
  maxHeight: 8192,
  minWidth: 200,
  minHeight: 200,
  maxPixels: 40_000_000,
  maxIpPerDay: 2,
  voteType: "fan_submit"
};

export function validVoterId(value) {
  return /^[a-zA-Z0-9_-]{24,96}$/.test(value);
}

export async function hashVoter(voterId, env) {
  const salt = env.VOTE_SALT || "summer-of-burgers-dev-salt";
  const bytes = new TextEncoder().encode(`${salt}:voter:${voterId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

export async function hashIp(ip, env) {
  const salt = env.VOTE_SALT || "summer-of-burgers-dev-salt";
  const bytes = new TextEncoder().encode(`${salt}:ip:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

export function clientIp(request) {
  const header = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const ip = header.split(",")[0].trim();
  return ip || "local-dev";
}

export function currentUploadDay(date = new Date()) {
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

export function nextResetIso() {
  const now = new Date();
  const easternNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const easternReset = new Date(easternNow);
  easternReset.setDate(easternReset.getDate() + 1);
  easternReset.setHours(0, 0, 0, 0);
  return easternReset.toISOString();
}

export function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function detectImageFormat(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export function readImageDimensions(bytes, format) {
  if (format.mime === "image/png" && bytes.length >= 24) {
    return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
  }
  if (format.mime === "image/jpeg") return readJpegDimensions(bytes);
  if (format.mime === "image/webp") return readWebpDimensions(bytes);
  return null;
}

export function validateFanImage(bytes, declaredType) {
  if (!bytes?.length) return { ok: false, error: "Image is required" };
  if (bytes.length < FAN_UPLOAD.minBytes) {
    return { ok: false, error: "Image is too small" };
  }
  if (bytes.length > FAN_UPLOAD.maxBytes) {
    return { ok: false, error: "Image must be 6MB or smaller" };
  }

  const format = detectImageFormat(bytes);
  if (!format) return { ok: false, error: "Use a JPG, PNG, or WebP photo" };
  if (declaredType && declaredType !== format.mime) {
    return { ok: false, error: "Image type does not match file contents" };
  }

  const dimensions = readImageDimensions(bytes, format);
  if (!dimensions?.width || !dimensions?.height) {
    return { ok: false, error: "Could not read image dimensions" };
  }
  if (dimensions.width < FAN_UPLOAD.minWidth || dimensions.height < FAN_UPLOAD.minHeight) {
    return { ok: false, error: "Image must be at least 200×200 pixels" };
  }
  if (dimensions.width > FAN_UPLOAD.maxWidth || dimensions.height > FAN_UPLOAD.maxHeight) {
    return { ok: false, error: "Image is too large (max 8192×8192)" };
  }
  if (dimensions.width * dimensions.height > FAN_UPLOAD.maxPixels) {
    return { ok: false, error: "Image resolution is too high" };
  }

  return { ok: true, format, dimensions };
}

export function rejectOversizedBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > FAN_UPLOAD.maxBodyBytes) {
    return Response.json({ error: "Upload is too large" }, { status: 413 });
  }
  return null;
}

export async function getFanUploadStatus(env, voterId, request) {
  if (!env.DB) return { allowed: false, error: "Uploads unavailable" };
  if (!validVoterId(voterId)) return { allowed: false, error: "Invalid browser token" };

  const uploadDay = currentUploadDay();
  const voterHash = await hashVoter(voterId, env);
  const ipHash = await hashIp(clientIp(request), env);

  const voterRow = await env.DB.prepare(
    "SELECT 1 FROM daily_vote_limits WHERE vote_type = ? AND vote_day = ? AND voter_hash = ?"
  ).bind(FAN_UPLOAD.voteType, uploadDay, voterHash).first();
  if (voterRow) {
    return { allowed: false, reason: "daily_voter", uploadDay, nextReset: nextResetIso() };
  }

  const ipRow = await env.DB.prepare(
    "SELECT upload_count FROM fan_upload_ip_daily WHERE ip_hash = ? AND upload_day = ?"
  ).bind(ipHash, uploadDay).first();
  if (ipRow && Number(ipRow.upload_count) >= FAN_UPLOAD.maxIpPerDay) {
    return { allowed: false, reason: "daily_ip", uploadDay, nextReset: nextResetIso() };
  }

  return { allowed: true, uploadDay, nextReset: nextResetIso() };
}

export async function assertFanUploadAllowed(env, voterId, request) {
  const status = await getFanUploadStatus(env, voterId, request);
  if (status.allowed) return status;
  const message = status.reason === "daily_ip"
    ? "Too many uploads from this network today. Try again tomorrow."
    : "You already submitted a fan burger today. Come back tomorrow.";
  return { ...status, error: message, status: 429 };
}

export async function recordFanUpload(env, voterId, request) {
  const uploadDay = currentUploadDay();
  const voterHash = await hashVoter(voterId, env);
  const ipHash = await hashIp(clientIp(request), env);

  await env.DB.prepare(
    "INSERT INTO daily_vote_limits (vote_type, vote_day, voter_hash) VALUES (?, ?, ?)"
  ).bind(FAN_UPLOAD.voteType, uploadDay, voterHash).run();

  await env.DB.prepare(`
    INSERT INTO fan_upload_ip_daily (ip_hash, upload_day, upload_count)
    VALUES (?, ?, 1)
    ON CONFLICT(ip_hash, upload_day) DO UPDATE SET upload_count = upload_count + 1
  `).bind(ipHash, uploadDay).run();
}

export function isLimitError(error) {
  return String(error?.message || error).toLowerCase().includes("unique");
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readU32(bytes, offset) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function readJpegDimensions(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker === 0xc0 || marker === 0xc2) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8]
      };
    }
    offset += 2 + size;
  }
  return null;
}

function readWebpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === "VP8 ") {
    return {
      width: bytes[26] | (bytes[27] << 8),
      height: bytes[28] | (bytes[29] << 8)
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    };
  }
  return null;
}
