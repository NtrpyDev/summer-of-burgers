const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/data/burgers.json",
  "public/data/fan-burgers.json",
  "functions/api/burgers.js",
  "functions/api/vote.js",
  "functions/api/bracket.js",
  "functions/api/fan-burgers.js",
  "functions/api/fan-burgers/status.js",
  "functions/_lib/fan-upload.js",
  "migrations/0002_fan_upload_limits.sql",
  "functions/api/fan-vote.js",
  "functions/api/vote/status.js",
  "functions/share/[[path]].js",
  "migrations/0001_schema.sql",
  "scripts/collector.cjs"
];

for (const relative of required) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`Missing ${relative}`);
}

const burgers = JSON.parse(fs.readFileSync(path.join(root, "public/data/burgers.json"), "utf8"));
for (const burger of burgers) {
  const requiredFields = ["id", "tweet_id", "source_url", "media_index", "r2_key", "thumb_key", "category", "tags"];
  for (const field of requiredFields) {
    if (!(field in burger)) throw new Error(`Burger ${burger.id || "unknown"} missing ${field}`);
  }
}

const fanBurgers = JSON.parse(fs.readFileSync(path.join(root, "public/data/fan-burgers.json"), "utf8"));
for (const burger of fanBurgers) {
  const requiredFields = ["id", "title", "image_key", "thumb_key", "image_url", "thumb_url"];
  for (const field of requiredFields) {
    if (!(field in burger)) throw new Error(`Fan burger ${burger.id || "unknown"} missing ${field}`);
  }
}

console.log(`Smoke test passed with ${burgers.length} burgers.`);
