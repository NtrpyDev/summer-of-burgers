import {
  getFanUploadStatus,
  validVoterId
} from "../../_lib/fan-upload.js";
import {
  resolveVoterIdentity,
  responseWithVoterCookie
} from "../../_lib/voting.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const voterId = String(url.searchParams.get("voterId") || "");
  const identity = await resolveVoterIdentity(request, env, voterId);
  if (!validVoterId(identity.voterId)) {
    return Response.json({ error: "Valid voterId is required" }, { status: 400 });
  }

  if (!env.DB) {
    return responseWithVoterCookie({ allowed: true, localOnly: true, nextReset: null }, identity);
  }

  const status = await getFanUploadStatus(env, identity.voterId, request);
  return responseWithVoterCookie({
    allowed: Boolean(status.allowed),
    reason: status.reason || null,
    uploadDay: status.uploadDay || null,
    nextReset: status.nextReset || null
  }, identity);
}
