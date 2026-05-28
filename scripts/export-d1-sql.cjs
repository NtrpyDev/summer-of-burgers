const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const burgers = JSON.parse(fs.readFileSync(path.join(root, "public", "data", "burgers.json"), "utf8"));
const fanBurgersPath = path.join(root, "public", "data", "fan-burgers.json");
const fanBurgers = fs.existsSync(fanBurgersPath) ? JSON.parse(fs.readFileSync(fanBurgersPath, "utf8")) : [];

const statements = burgers.map((burger) => `
INSERT OR REPLACE INTO burgers (
  id, tweet_id, source_url, posted_at, caption, media_index, r2_key, thumb_key,
  image_url, thumb_url, image_hash, perceptual_hash, category, tags, elo, wins,
  losses, bracket_wins, created_at, updated_at
) VALUES (
  ${sql(burger.id)}, ${sql(burger.tweet_id)}, ${sql(burger.source_url)}, ${sql(burger.posted_at)},
  ${sql(burger.caption)}, ${Number(burger.media_index || 0)}, ${sql(burger.r2_key)}, ${sql(burger.thumb_key)},
  ${sql(`/api/image/${burger.r2_key}`)}, ${sql(`/api/image/${burger.thumb_key}`)}, ${sql(burger.image_hash)},
  ${sql(burger.perceptual_hash)}, ${sql(burger.category || "unknown")}, ${sql(JSON.stringify(burger.tags || []))},
  ${Number(burger.elo || 1500)}, ${Number(burger.wins || 0)}, ${Number(burger.losses || 0)},
  ${Number(burger.bracket_wins || 0)}, ${sql(burger.created_at)}, ${sql(burger.updated_at)}
);`.trim());

for (const burger of fanBurgers) {
  statements.push(`
INSERT OR REPLACE INTO fan_burgers (
  id, title, caption, image_key, thumb_key, image_url, thumb_url, image_hash,
  elo, wins, losses, approved, created_at, updated_at
) VALUES (
  ${sql(burger.id)}, ${sql(burger.title)}, ${sql(burger.caption)}, ${sql(burger.image_key)}, ${sql(burger.thumb_key)},
  ${sql(burger.image_url?.startsWith("/api/") ? burger.image_url : `/api/image/${burger.image_key}`)},
  ${sql(burger.thumb_url?.startsWith("/api/") ? burger.thumb_url : `/api/image/${burger.thumb_key}`)},
  ${sql(burger.image_hash)}, ${Number(burger.elo || 1500)}, ${Number(burger.wins || 0)}, ${Number(burger.losses || 0)},
  1, ${sql(burger.created_at)}, ${sql(burger.updated_at)}
);`.trim());
}

const out = path.join(root, "data", "seed-burgers.sql");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${statements.join("\n")}\n`);
console.log(`Wrote ${out}`);

function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}
