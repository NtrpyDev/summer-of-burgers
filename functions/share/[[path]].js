export async function onRequestGet(context) {
  const parts = Array.isArray(context.params.path) ? context.params.path : String(context.params.path || "").split("/");
  const type = parts[0] || "official";
  const id = parts[1] || "";
  const origin = new URL(context.request.url).origin;

  let item = null;
  if (type === "fan") {
    item = await context.env.DB?.prepare("SELECT id, title, caption, image_key FROM fan_burgers WHERE id = ? AND approved = 1").bind(id).first();
  } else {
    item = await context.env.DB?.prepare("SELECT id, caption, posted_at FROM burgers WHERE id = ?").bind(id).first();
  }

  const title = type === "fan"
    ? item?.title || "Fan Burger Duel"
    : item?.caption || "Summer of Burgers pick";
  const cleanTitle = cleanShareTitle(title);
  const image = type === "fan"
    ? `${origin}/api/image/share/fan-generic.jpg`
    : `${origin}/api/image/share/${id}.jpg`;
  const description = `I voted in #SUMMEROFBURGERS. My pick: ${cleanTitle}. Make yours.`;

  return new Response(shareHtml({
    canonical: `${origin}/share/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    image,
    title: "I voted in #SUMMEROFBURGERS",
    description,
    siteUrl: origin
  }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function cleanShareTitle(value) {
  return String(value || "Today's pick").replace(/#\S+/g, "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}
