export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json([]);

  const result = await env.DB.prepare(`
    SELECT
      id,
      tweet_id,
      source_url,
      posted_at,
      caption,
      media_index,
      r2_key,
      thumb_key,
      COALESCE(image_url, '/api/image/' || r2_key) AS image_url,
      COALESCE(thumb_url, '/api/image/' || thumb_key) AS thumb_url,
      image_hash,
      perceptual_hash,
      category,
      tags,
      elo,
      wins,
      losses,
      bracket_wins,
      created_at,
      updated_at
    FROM burgers
    ORDER BY posted_at DESC, media_index ASC
  `).all();

  return json(result.results || []);
}

function json(data, init = {}) {
  return Response.json(data, {
    headers: {
      "cache-control": "public, max-age=60",
      ...(init.headers || {})
    },
    ...init
  });
}
