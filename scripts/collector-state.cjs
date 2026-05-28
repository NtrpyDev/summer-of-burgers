const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const stateFile = path.join(root, "data", "collector-state.json");

function mediaKey(tweetId, mediaIndex) {
  return `${tweetId}:${mediaIndex}`;
}

async function loadState() {
  try {
    const raw = JSON.parse(await fs.readFile(stateFile, "utf8"));
    return {
      version: 1,
      lastSeenTweetId: raw.lastSeenTweetId || null,
      processed: raw.processed && typeof raw.processed === "object" ? raw.processed : {}
    };
  } catch {
    return { version: 1, lastSeenTweetId: null, processed: {} };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function isProcessed(state, tweetId, mediaIndex) {
  return Boolean(state.processed[mediaKey(tweetId, mediaIndex)]);
}

function markProcessed(state, tweetId, mediaIndex, result) {
  const key = mediaKey(tweetId, mediaIndex);
  state.processed[key] = {
    isBurger: Boolean(result.isBurger),
    checkedAt: new Date().toISOString(),
    burgerScore: result.burgerScore ?? null,
    otherScore: result.otherScore ?? null,
    imported: Boolean(result.imported)
  };
  bumpLastSeen(state, tweetId);
}

function bumpLastSeen(state, tweetId) {
  const id = String(tweetId || "");
  if (!/^\d+$/.test(id)) return;
  if (!state.lastSeenTweetId || BigInt(id) > BigInt(state.lastSeenTweetId)) {
    state.lastSeenTweetId = id;
  }
}

function seedFromBurgers(state, burgers) {
  for (const burger of burgers) {
    const tweetId = String(burger.tweet_id || "");
    const mediaIndex = Number(burger.media_index || 0);
    if (!tweetId) continue;
    const key = mediaKey(tweetId, mediaIndex);
    if (!state.processed[key]) {
      state.processed[key] = {
        isBurger: true,
        checkedAt: new Date().toISOString(),
        imported: true,
        seeded: true
      };
    }
    bumpLastSeen(state, tweetId);
  }
}

module.exports = {
  stateFile,
  loadState,
  saveState,
  isProcessed,
  markProcessed,
  seedFromBurgers
};
