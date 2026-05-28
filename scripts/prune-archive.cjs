const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const dataFile = path.join(publicDir, "data", "burgers.json");
const START_DATE = "2026-05-25";

const burgers = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const kept = [];
const removed = [];

for (const burger of burgers) {
  const date = String(burger.r2_key || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1] || String(burger.posted_at || "").slice(0, 10);
  if (date >= START_DATE) {
    kept.push(burger);
    continue;
  }
  removed.push(burger);
  for (const key of [burger.r2_key, burger.thumb_key]) {
    if (!key) continue;
    const file = path.join(publicDir, "images", key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  const share = path.join(publicDir, "images", "share", `${burger.id}.jpg`);
  if (fs.existsSync(share)) fs.unlinkSync(share);
}

fs.writeFileSync(dataFile, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`Kept ${kept.length} burgers, removed ${removed.length} pre-season entries.`);
