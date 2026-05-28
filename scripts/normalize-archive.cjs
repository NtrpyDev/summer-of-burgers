const fs = require("node:fs");
const path = require("node:path");
const { cleanCaption: scrubCaption } = require("./caption-utils.cjs");

const root = path.resolve(__dirname, "..");
const dataFile = path.join(root, "public", "data", "burgers.json");
const originalsDir = path.join(root, "public", "images", "originals");
const thumbsDir = path.join(root, "public", "images", "thumbs");

const rows = JSON.parse(fs.readFileSync(dataFile, "utf8"));

for (const burger of rows) {
  burger.caption = cleanCaption(burger.caption);
  burger.category = categorize(burger.caption);
  burger.tags = tagsFor(burger.caption);

  const postedDate = datePart(burger.posted_at) || "2026-05-25";
  const slug = slugify(burger.caption || burger.category || "burger");
  const originalExt = path.extname(burger.image_url || burger.r2_key || ".jpg") || ".jpg";
  const baseName = `${postedDate}__barstoolbigcat__tweet-${burger.tweet_id}__img-${Number(burger.media_index || 0) + 1}__${slug}`;
  const originalName = `${baseName}${originalExt}`;
  const thumbName = `${baseName}.webp`;

  const oldOriginal = path.join(root, "public", burger.image_url || `/images/originals/${path.basename(burger.r2_key)}`);
  const oldThumb = path.join(root, "public", burger.thumb_url || `/images/thumbs/${path.basename(burger.thumb_key)}`);
  const nextOriginal = path.join(originalsDir, originalName);
  const nextThumb = path.join(thumbsDir, thumbName);

  moveIfNeeded(oldOriginal, nextOriginal);
  moveIfNeeded(oldThumb, nextThumb);

  burger.r2_key = `originals/${originalName}`;
  burger.thumb_key = `thumbs/${thumbName}`;
  burger.image_url = `/images/originals/${originalName}`;
  burger.thumb_url = `/images/thumbs/${thumbName}`;
  burger.updated_at = new Date().toISOString();
}

fs.writeFileSync(dataFile, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Normalized ${rows.length} burgers.`);

function moveIfNeeded(from, to) {
  if (from === to || !fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) fs.unlinkSync(to);
  fs.renameSync(from, to);
}

function cleanCaption(value) {
  return scrubCaption(
    String(value || "")
      .replace(/^Big Cat\s+@BarstoolBigCat\s+/i, "")
      .replace(/\s+\d{1,2}:\d{2}\s+[AP]M\s+·\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4}\s+·\s+[\d.]+[KMB]?$/i, "")
  );
}

function categorize(caption) {
  const text = caption.toLowerCase();
  if (/\b(smash|smashed)\b/.test(text)) return "smashburger";
  if (/\b(grill|grilled|blackstone|griddle)\b/.test(text)) return "grill";
  if (/\b(mcdonald|wendy|burger king|culver|shake shack|five guys|in-n-out|fast food)\b/.test(text)) return "fast-food";
  if (/\b(restaurant|diner|bar|steakhouse)\b/.test(text)) return "restaurant";
  if (/\b(home|backyard|made|cooked)\b/.test(text)) return "home-cooked";
  if (/\bcheese\b/.test(text)) return "cheeseburger";
  if (/\b(double|triple|quad|two patty|2 patty|2 piece|two piece)\b/.test(text)) return "multi-patty";
  return "unknown";
}

function tagsFor(caption) {
  const text = caption.toLowerCase();
  const tags = new Set(["burger"]);
  for (const tag of ["cheese", "bacon", "onion", "pickle", "grill", "smash", "double", "fries"]) {
    if (text.includes(tag)) tags.add(tag);
  }
  if (/\b(2 piece|two piece|double)\b/.test(text)) tags.add("multi-patty");
  if (text.includes("summerofburgers") || text.includes("summer of burgers")) tags.add("summer-of-burgers");
  return [...tags];
}

function datePart(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value || "burger")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "burger";
}
