import {
  assertFanUploadAllowed,
  cleanText,
  clientIp,
  FAN_UPLOAD,
  getFanUploadStatus,
  hashIp,
  hashVoter,
  isLimitError,
  rejectOversizedBody,
  sha256,
  validateFanImage,
  validVoterId
} from "../_lib/fan-upload.js";
import {
  resolveVoterIdentity,
  responseWithVoterCookie
} from "../_lib/voting.js";

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return Response.json([]);

  const result = await env.DB.prepare(`
    SELECT
      id,
      title,
      caption,
      image_key,
      thumb_key,
      COALESCE(image_url, '/api/image/' || image_key) AS image_url,
      COALESCE(thumb_url, '/api/image/' || thumb_key) AS thumb_url,
      image_hash,
      elo,
      wins,
      losses,
      created_at,
      updated_at
    FROM fan_burgers
    WHERE approved = 1
    ORDER BY created_at DESC
  `).all();

  return Response.json(result.results || [], {
    headers: { "cache-control": "public, max-age=30" }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.BURGER_IMAGES) {
    return Response.json({ error: "D1 and R2 bindings are required" }, { status: 501 });
  }

  const tooLarge = rejectOversizedBody(request);
  if (tooLarge) return tooLarge;

  const form = await request.formData();
  const voterId = String(form.get("voterId") || "");
  const identity = await resolveVoterIdentity(request, env, voterId);
  if (!validVoterId(identity.voterId)) {
    return Response.json({ error: "Valid browser token is required" }, { status: 400 });
  }

  const gate = await assertFanUploadAllowed(env, identity.voterId, request);
  if (!gate.allowed) {
    return responseWithVoterCookie(
      { error: gate.error, allowed: false, nextReset: gate.nextReset },
      identity,
      { status: gate.status || 429 }
    );
  }

  const title = cleanText(form.get("title") || "Fan burger").slice(0, 72);
  const caption = cleanText(form.get("caption") || "").slice(0, 240);
  const file = form.get("image");
  if (!file || typeof file === "string") {
    return Response.json({ error: "Image is required" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateFanImage(bytes, file.type);
  if (!checked.ok) {
    return Response.json({ error: checked.error }, { status: 400 });
  }

  const hash = await sha256(bytes);
  const duplicate = await env.DB.prepare("SELECT id FROM fan_burgers WHERE image_hash = ?").bind(hash).first();
  if (duplicate) {
    return Response.json({ error: "That image was already submitted" }, { status: 409 });
  }

  const { format } = checked;
  const id = `fan-${crypto.randomUUID()}`;
  const imageKey = `fan/${id}.${format.ext}`;
  const voterHash = await hashVoter(identity.voterId, env);
  const ipHash = await hashIp(clientIp(request), env);

  await env.BURGER_IMAGES.put(imageKey, bytes, {
    httpMetadata: { contentType: format.mime }
  });

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO fan_burgers
        (id, title, caption, image_key, thumb_key, image_hash, image_url, thumb_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        title || "Fan burger",
        caption,
        imageKey,
        imageKey,
        hash,
        `/api/image/${imageKey}`,
        `/api/image/${imageKey}`
      ),
      env.DB.prepare(
        "INSERT INTO daily_vote_limits (vote_type, vote_day, voter_hash) VALUES (?, ?, ?)"
      ).bind(FAN_UPLOAD.voteType, gate.uploadDay, voterHash),
      env.DB.prepare(`
        INSERT INTO fan_upload_ip_daily (ip_hash, upload_day, upload_count)
        VALUES (?, ?, 1)
        ON CONFLICT(ip_hash, upload_day) DO UPDATE SET upload_count = upload_count + 1
      `).bind(ipHash, gate.uploadDay)
    ]);
  } catch (error) {
    await env.BURGER_IMAGES.delete(imageKey);
    if (isLimitError(error)) {
      const status = await getFanUploadStatus(env, identity.voterId, request);
      const message = status.reason === "daily_ip"
        ? "Too many uploads from this network today. Try again tomorrow."
        : "You already submitted a fan burger today. Come back tomorrow.";
      return responseWithVoterCookie(
        { error: message, allowed: false, nextReset: status.nextReset },
        identity,
        { status: 429 }
      );
    }
    throw error;
  }

  return responseWithVoterCookie({
    id,
    title: title || "Fan burger",
    caption,
    image_key: imageKey,
    thumb_key: imageKey,
    image_url: `/api/image/${imageKey}`,
    thumb_url: `/api/image/${imageKey}`,
    image_hash: hash,
    elo: 1500,
    wins: 0,
    losses: 0,
    created_at: new Date().toISOString()
  }, identity, { status: 201 });
}
