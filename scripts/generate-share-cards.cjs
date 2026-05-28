const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const nodeModules = process.env.NODE_PATH || path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");
if (!module.paths.includes(nodeModules)) module.paths.push(nodeModules);

const publicDir = path.join(root, "public");
const shareDir = path.join(publicDir, "images", "share");
const burgers = JSON.parse(fs.readFileSync(path.join(publicDir, "data", "burgers.json"), "utf8"));

fs.mkdirSync(shareDir, { recursive: true });

(async () => {
  for (const burger of burgers) {
    const imagePath = path.join(publicDir, burger.image_url);
    if (!fs.existsSync(imagePath)) continue;
    await createShareCard(fs.readFileSync(imagePath), path.join(shareDir, `${burger.id}.jpg`), burger.caption || "Today's pick");
  }
  await createGenericFanCard();
  console.log(`Generated ${burgers.length} share cards.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function createShareCard(buffer, outputPath, title) {
  const sharp = requirePackage("sharp");
  const overlay = Buffer.from(cardSvg(title, "I VOTED IN #SUMMEROFBURGERS"));
  await sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 630, fit: "cover" })
    .modulate({ saturation: 1.08 })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outputPath);
}

async function createGenericFanCard() {
  const sharp = requirePackage("sharp");
  const svg = Buffer.from(cardSvg("Fan Burger Duel", "I VOTED IN #SUMMEROFBURGERS"));
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 3,
      background: "#160f0b"
    }
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(shareDir, "fan-generic.jpg"));
}

function cardSvg(title, kicker) {
  const wrapped = wrap(title, 24).slice(0, 3);
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
  <text x="78" y="128" fill="#f0b323" font-family="Arial Black, Arial, sans-serif" font-size="31" font-weight="900" letter-spacing="3">${escapeXml(kicker)}</text>
  ${wrapped.map((line, index) => `<text x="78" y="${232 + index * 92}" fill="#fff8e9" font-family="Arial Black, Arial, sans-serif" font-size="82" font-weight="900">${escapeXml(line)}</text>`).join("")}
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

function requirePackage(name) {
  try {
    return require(name);
  } catch (error) {
    const pnpmDir = path.join(nodeModules, ".pnpm");
    const match = fs.existsSync(pnpmDir)
      ? fs.readdirSync(pnpmDir).find((entry) => entry.startsWith(`${name}@`))
      : null;
    if (!match) throw error;
    return require(path.join(pnpmDir, match, "node_modules", name));
  }
}
