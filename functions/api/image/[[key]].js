export async function onRequestGet(context) {
  const key = Array.isArray(context.params.key) ? context.params.key.join("/") : context.params.key;
  const { env } = context;
  if (!env.BURGER_IMAGES) return new Response("R2 binding missing", { status: 501 });
  if (!key) return new Response("Missing image key", { status: 400 });

  const object = await env.BURGER_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
