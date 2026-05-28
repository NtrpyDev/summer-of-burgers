import {
  getFanUploadStatus,
  validVoterId
} from "../../_lib/fan-upload.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const voterId = String(url.searchParams.get("voterId") || "");

  if (!validVoterId(voterId)) {
    return Response.json({ error: "Valid voterId is required" }, { status: 400 });
  }

  if (!env.DB) {
    return Response.json({ allowed: true, localOnly: true, nextReset: null });
  }

  const status = await getFanUploadStatus(env, voterId, request);
  return Response.json({
    allowed: Boolean(status.allowed),
    reason: status.reason || null,
    uploadDay: status.uploadDay || null,
    nextReset: status.nextReset || null
  });
}
