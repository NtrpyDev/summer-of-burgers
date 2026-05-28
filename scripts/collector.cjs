const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

require("./load-env.cjs");

const {
  hasApiCredentials,
  collectImageTweetCandidates,
  listCampaignFromApi
} = require("./x-collector-api.cjs");
const { isBurgerImageWithCaption } = require("./burger-detect.cjs");
const {
  loadState,
  saveState,
  isProcessed,
  markProcessed,
  seedFromBurgers
} = require("./collector-state.cjs");
const { cleanCaption } = require("./caption-utils.cjs");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const originalsDir = path.join(publicDir, "images", "originals");
const thumbsDir = path.join(publicDir, "images", "thumbs");
const shareDir = path.join(publicDir, "images", "share");
const dataFile = path.join(publicDir, "data", "burgers.json");
const retryFile = path.join(root, "data", "failed", "retry-queue.json");
const START_DATE = "2026-05-25";
const HANDLE = "BarstoolBigCat";
const args = new Set(process.argv.slice(2));
const explicitTweetIds = parseTweetIds(process.argv.slice(2));

const apiHelpers = {
  cleanCaption,
  categorize,
  tagsFor,
  normalizeTwimgUrl
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await ensureDirs();
  if (args.has("--fixture-template")) {
    await writeFixtureTemplate();
    return;
  }

  const burgers = await readJson(dataFile, []);
  const state = await loadState();
  seedFromBurgers(state, burgers);

  if (args.has("--list-campaign")) {
    requireApiCredentials();
    await listCampaignFromApi({ startDate: START_DATE, burgers, state, helpers: apiHelpers });
    return;
  }

  if (args.has("--rebuild-archive")) {
    requireApiCredentials();
    await rebuildArchiveFromVision();
    return;
  }

  let failures = await readJson(retryFile, []);
  const candidates = await collectCandidates(burgers, failures, state);
  const summary = {
    scanned: 0,
    imported: 0,
    notBurger: 0,
    skipped: 0,
    failed: 0
  };

  if (!candidates.length) {
    console.log("No new image tweets to scan.");
  }

  for (const candidate of candidates) {
    summary.scanned += 1;
    try {
      const result = await processCandidate(candidate, burgers, state);
      if (result === "imported") summary.imported += 1;
      else if (result === "not-burger") summary.notBurger += 1;
      else summary.skipped += 1;
      failures = removeFailure(failures, candidate);
      await saveState(state);
    } catch (error) {
      summary.failed += 1;
      failures.push({
        tweetId: candidate.tweetId,
        mediaIndex: candidate.mediaIndex,
        sourceUrl: candidate.sourceUrl,
        reason: error.message,
        failedAt: new Date().toISOString()
      });
      await saveState(state);
    }
  }

  burgers.sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0) || a.media_index - b.media_index);
  await writeJson(dataFile, burgers);
  await writeJson(retryFile, failures.slice(-200));
  await saveState(state);

  console.log(
    `Collector finished: ${summary.scanned} scanned, ${summary.imported} imported, ` +
    `${summary.notBurger} not burger, ${summary.skipped} skipped, ${summary.failed} failed.`
  );
  if (state.lastSeenTweetId) {
    console.log(`State saved (last seen tweet ${state.lastSeenTweetId}).`);
  }
  if (summary.imported > 0) {
    console.log(`Added ${summary.imported} burger(s) to the archive. Run: bash scripts/linux/collect-and-sync.sh`);
  }
}

function requireApiCredentials() {
  if (!hasApiCredentials()) {
    throw new Error(
      "Missing X_BEARER_TOKEN in .env. See https://docs.x.com/x-api/getting-started/getting-access"
    );
  }
}

async function rebuildArchiveFromVision() {
  console.log("Rebuilding archive: scanning every campaign image tweet with AI...");
  const candidates = await collectImageTweetCandidates({
    startDate: START_DATE,
    sinceTweetId: null,
    explicitTweetIds: [],
    helpers: apiHelpers
  });

  const burgers = [];
  const state = { version: 1, lastSeenTweetId: null, processed: {} };
  let imported = 0;
  let notBurger = 0;

  for (const candidate of candidates) {
    try {
      const imageBuffer = await fetchBuffer(candidate.imageUrl);
      const vision = args.has("--skip-vision")
        ? { isBurger: true, burgerScore: 1, otherScore: 0 }
        : await isBurgerImageWithCaption(imageBuffer, candidate.caption);

      if (!vision.isBurger) {
        notBurger += 1;
        console.log(`Drop ${candidate.tweetId}: not a burger`);
        markProcessed(state, candidate.tweetId, candidate.mediaIndex, { ...vision, imported: false });
        continue;
      }

      await writeBurgerFiles(candidate, imageBuffer, burgers);
      markProcessed(state, candidate.tweetId, candidate.mediaIndex, { ...vision, imported: true });
      imported += 1;
    } catch (error) {
      console.error(`Failed ${candidate.tweetId}: ${error.message}`);
    }
    await saveState(state);
  }

  burgers.sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0) || a.media_index - b.media_index);
  await writeJson(dataFile, burgers);
  await saveState(state);
  const removed = await pruneOrphanImages(burgers);
  console.log(`Rebuild done: ${imported} burgers kept, ${notBurger} non-burger tweets dropped.`);
  if (removed) console.log(`Removed ${removed} leftover image file(s) from public/images.`);
  console.log("Run: bash scripts/linux/collect-and-sync.sh");
}

async function pruneOrphanImages(burgers) {
  const keepOriginals = new Set(burgers.map((burger) => path.basename(burger.r2_key)));
  const keepThumbs = new Set(burgers.map((burger) => path.basename(burger.thumb_key)));
  const keepShare = new Set(burgers.map((burger) => `${burger.id}.jpg`));
  let removed = 0;

  for (const [dir, keep] of [
    [originalsDir, keepOriginals],
    [thumbsDir, keepThumbs],
    [shareDir, keepShare]
  ]) {
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === "fan-generic.jpg" || keep.has(name)) continue;
      await fs.unlink(path.join(dir, name));
      removed += 1;
    }
  }

  return removed;
}

async function collectCandidates(burgers, failures, state) {
  if (process.env.BURGER_COLLECTOR_FIXTURE) {
    return readJson(path.resolve(process.env.BURGER_COLLECTOR_FIXTURE), []);
  }

  requireApiCredentials();

  const retryIds = failures.map((item) => String(item.tweetId || "")).filter(Boolean);
  const tweetIds = explicitTweetIds.length ? explicitTweetIds : [...new Set(retryIds)];
  const sinceTweetId = args.has("--backfill") || explicitTweetIds.length
    ? null
    : state.lastSeenTweetId;

  const allCandidates = await collectImageTweetCandidates({
    startDate: START_DATE,
    sinceTweetId,
    explicitTweetIds: tweetIds,
    helpers: apiHelpers
  });

  return allCandidates.filter((candidate) => {
    if (explicitTweetIds.includes(candidate.tweetId)) return true;
    if (args.has("--backfill")) return !isProcessed(state, candidate.tweetId, candidate.mediaIndex);
    return !isProcessed(state, candidate.tweetId, candidate.mediaIndex);
  });
}

async function processCandidate(candidate, burgers, state) {
  const force = explicitTweetIds.includes(candidate.tweetId);

  if (
    !force &&
    burgers.some((burger) => burger.tweet_id === candidate.tweetId && Number(burger.media_index) === candidate.mediaIndex)
  ) {
    markProcessed(state, candidate.tweetId, candidate.mediaIndex, { isBurger: true, imported: true });
    return "skipped";
  }

  if (!isSummerCampaignInstant(candidate.postedAt)) {
    markProcessed(state, candidate.tweetId, candidate.mediaIndex, { isBurger: false, burgerScore: 0, otherScore: 1 });
    return "skipped";
  }

  const imageBuffer = await fetchBuffer(candidate.imageUrl);
  const hash = crypto.createHash("sha256").update(imageBuffer).digest("hex");
  if (burgers.some((burger) => burger.image_hash === hash)) {
    markProcessed(state, candidate.tweetId, candidate.mediaIndex, { isBurger: true, imported: true });
    return "skipped";
  }

  let vision = { isBurger: true, burgerScore: 1, otherScore: 0 };
  if (!args.has("--skip-vision")) {
    console.log(`Scanning tweet ${candidate.tweetId} image ${candidate.mediaIndex + 1}...`);
    vision = await isBurgerImageWithCaption(imageBuffer, candidate.caption);
  }

  if (!vision.isBurger) {
    console.log(
      `Not a burger: ${candidate.tweetId} img ${candidate.mediaIndex + 1} ` +
      `(burger ${vision.burgerScore?.toFixed(2)}, other ${vision.otherScore?.toFixed(2)})`
    );
    markProcessed(state, candidate.tweetId, candidate.mediaIndex, { ...vision, imported: false });
    return "not-burger";
  }

  await writeBurgerFiles(candidate, imageBuffer, burgers);
  markProcessed(state, candidate.tweetId, candidate.mediaIndex, { ...vision, imported: true });
  return "imported";
}

async function writeBurgerFiles(candidate, imageBuffer, burgers) {
  const ext = extensionFor(candidate.imageUrl);
  const postedDate = datePart(candidate.postedAt) || START_DATE;
  const slug = slugify(candidate.category !== "unknown" ? candidate.category : candidate.caption || "burger");
  const baseName = `${postedDate}__barstoolbigcat__tweet-${candidate.tweetId}__img-${candidate.mediaIndex + 1}__${slug}`;
  const originalName = `${baseName}.${ext}`;
  const thumbName = `${baseName}.webp`;
  const shareName = `tweet-${candidate.tweetId}-img-${candidate.mediaIndex + 1}.jpg`;
  const originalPath = path.join(originalsDir, originalName);
  const thumbPath = path.join(thumbsDir, thumbName);
  const sharePath = path.join(shareDir, shareName);

  await fs.writeFile(originalPath, imageBuffer);
  await createThumbnail(imageBuffer, thumbPath);
  await createShareCard(imageBuffer, sharePath, candidate.caption || "Today's pick");

  const burger = {
    id: `tweet-${candidate.tweetId}-img-${candidate.mediaIndex + 1}`,
    tweet_id: candidate.tweetId,
    source_url: candidate.sourceUrl,
    posted_at: candidate.postedAt,
    caption: candidate.caption,
    media_index: candidate.mediaIndex,
    r2_key: `originals/${originalName}`,
    thumb_key: `thumbs/${thumbName}`,
    image_url: `/images/originals/${originalName}`,
    thumb_url: `/images/thumbs/${thumbName}`,
    image_hash: crypto.createHash("sha256").update(imageBuffer).digest("hex"),
    perceptual_hash: null,
    category: candidate.category,
    tags: candidate.tags,
    elo: 1500,
    wins: 0,
    losses: 0,
    bracket_wins: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  burgers.push(burger);
  console.log(`Imported burger ${burger.image_url}`);
}

async function createThumbnail(buffer, outputPath) {
  const sharp = requirePackage("sharp");
  await sharp(buffer)
    .rotate()
    .resize({ width: 900, height: 675, fit: "cover" })
    .webp({ quality: 82 })
    .toFile(outputPath);
}

async function createShareCard(buffer, outputPath, title) {
  const sharp = requirePackage("sharp");
  await sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 630, fit: "cover" })
    .modulate({ saturation: 1.08 })
    .composite([{ input: Buffer.from(cardSvg(title)), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outputPath);
}

function cardSvg(title) {
  const lines = wrap(title, 24).slice(0, 3);
  return `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#160f0b" stop-opacity="0.95"/>
      <stop offset="0.58" stop-color="#160f0b" stop-opacity="0.66"/>
      <stop offset="1" stop-color="#160f0b" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect x="54" y="54" width="1092" height="522" rx="22" fill="none" stroke="#f0b323" stroke-opacity="0.7" stroke-width="3"/>
  <text x="78" y="128" fill="#f0b323" font-family="Arial Black, Arial, sans-serif" font-size="31" font-weight="900" letter-spacing="3">I VOTED IN #SUMMEROFBURGERS</text>
  ${lines.map((line, index) => `<text x="78" y="${232 + index * 92}" fill="#fff8e9" font-family="Arial Black, Arial, sans-serif" font-size="82" font-weight="900">${escapeXml(line)}</text>`).join("")}
  <text x="78" y="536" fill="#fff8e9" fill-opacity="0.82" font-family="Arial, sans-serif" font-size="30" font-weight="800">Cast your daily pick at Summer of Burgers</text>
</svg>`;
}

function wrap(value, maxChars) {
  const words = String(value || "Today's pick").replace(/#\S+/g, "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["Today's pick"];
}

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  }[char]));
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 SummerOfBurgersCollector/0.1"
    }
  });
  if (!response.ok) throw new Error(`Image download failed with ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function parseTweetIds(values) {
  const ids = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--tweet" || value === "--url") {
      const id = extractTweetId(values[index + 1] || "");
      if (id) ids.push(id);
      index += 1;
      continue;
    }
    if (value.startsWith("--tweet=") || value.startsWith("--url=")) {
      const id = extractTweetId(value.split("=").slice(1).join("="));
      if (id) ids.push(id);
      continue;
    }
    const id = extractTweetId(value);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function extractTweetId(value) {
  const match = String(value || "").match(/(?:status\/)?(\d{12,})/);
  return match ? match[1] : "";
}

function normalizeTwimgUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("name", "orig");
    return parsed.toString();
  } catch {
    return url;
  }
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

function isSummerCampaignInstant(postedAt) {
  if (!postedAt) return true;
  return Date.parse(postedAt) >= Date.parse(`${START_DATE}T00:00:00.000Z`);
}

function extensionFor(url) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".webp")) return "webp";
  return "jpg";
}

function datePart(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value || "burger")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "burger";
}

async function ensureDirs() {
  await fs.mkdir(originalsDir, { recursive: true });
  await fs.mkdir(thumbsDir, { recursive: true });
  await fs.mkdir(shareDir, { recursive: true });
  await fs.mkdir(path.dirname(retryFile), { recursive: true });
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]\n");
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Could not read valid JSON from ${filePath}: ${error.message}`);
    }
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(tempPath, filePath);
}

function removeFailure(failures, candidate) {
  return failures.filter((failure) => (
    String(failure.tweetId || "") !== String(candidate.tweetId || "") ||
    Number(failure.mediaIndex || 0) !== Number(candidate.mediaIndex || 0)
  ));
}

function requirePackage(name) {
  try {
    return require(name);
  } catch (error) {
    const fsSync = require("node:fs");
    const pnpmDir = path.join(nodeModules, ".pnpm");
    const match = fsSync.existsSync(pnpmDir)
      ? fsSync.readdirSync(pnpmDir).find((entry) => entry.startsWith(`${name}@`))
      : null;
    if (!match) throw error;
    return require(path.join(pnpmDir, match, "node_modules", name));
  }
}

async function writeFixtureTemplate() {
  const fixturePath = path.join(root, "data", "fixture.example.json");
  await fs.writeFile(fixturePath, `${JSON.stringify([{
    tweetId: "2059041294899347598",
    sourceUrl: `https://x.com/${HANDLE}/status/2059041294899347598`,
    postedAt: "2026-05-25T12:00:00.000Z",
    caption: "Seed burger",
    mediaIndex: 0,
    imageUrl: pathToFileURL(path.join(publicDir, "images", "placeholder.svg")).toString(),
    category: "unknown",
    tags: ["burger"]
  }], null, 2)}\n`);
  console.log(`Wrote ${fixturePath}`);
}
