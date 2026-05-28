const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "transformers");

const BURGER_LABELS = [
  "a close-up photo of a hamburger or cheeseburger",
  "a burger on a plate with fries",
  "a fast food hamburger"
];

const NOT_BURGER_LABELS = [
  "a photo of people with no hamburger visible",
  "a sports game or athlete with no burger",
  "a podcast or radio studio with no burger food",
  "a text meme or screenshot with no burger food"
];

let classifierPromise;

async function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.cacheDir = cacheDir;
      env.allowLocalModels = true;
      console.log("Loading burger vision model (first run downloads ~150MB once)...");
      return pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32");
    })();
  }
  return classifierPromise;
}

async function isBurgerImage(buffer) {
  const { RawImage } = await import("@xenova/transformers");
  const sharp = requireSharp();
  const classifier = await getClassifier();
  const jpeg = await sharp(buffer).rotate().resize(384, 384, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const image = await RawImage.fromBlob(new Blob([jpeg], { type: "image/jpeg" }));
  const results = await classifier(image, [...BURGER_LABELS, ...NOT_BURGER_LABELS]);
  const scores = Object.fromEntries(results.map((row) => [row.label, row.score]));
  const burgerScore = Math.max(...BURGER_LABELS.map((label) => scores[label] || 0));
  const otherScore = Math.max(...NOT_BURGER_LABELS.map((label) => scores[label] || 0));
  return { isBurger: false, burgerScore, otherScore };
}

function classifyBurgerImage(caption, vision) {
  const { burgerScore, otherScore } = vision;
  if (burgerScore >= 0.2 && burgerScore >= otherScore + 0.04) {
    return { isBurger: true, burgerScore, otherScore };
  }

  const text = String(caption || "").toLowerCase();
  if (/\bcan'?t stand smash burgers\b/.test(text)) {
    return { isBurger: false, burgerScore, otherScore };
  }
  if (burgerScore >= 0.14 && /\bburgers?\b/.test(text)) {
    return { isBurger: true, burgerScore, otherScore };
  }

  return { isBurger: false, burgerScore, otherScore };
}

async function isBurgerImageWithCaption(buffer, caption) {
  const vision = await isBurgerImage(buffer);
  return classifyBurgerImage(caption, vision);
}

function requireSharp() {
  const nodeModules = process.env.NODE_PATH || path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");
  try {
    return require(require.resolve("sharp", { paths: [path.join(root, "node_modules"), nodeModules] }));
  } catch {
    return require("sharp");
  }
}

module.exports = { isBurgerImage, isBurgerImageWithCaption, classifyBurgerImage };
