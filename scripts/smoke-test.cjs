const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/data/burgers.json",
  "public/data/fan-burgers.json",
  "functions/api/burgers.js",
  "functions/api/vote.js",
  "functions/api/fan-burgers.js",
  "functions/api/fan-burgers/status.js",
  "functions/_lib/voting.js",
  "functions/_lib/fan-upload.js",
  "migrations/0002_fan_upload_limits.sql",
  "migrations/0004_vote_ip_limits.sql",
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

for (const relative of [
  "functions/_lib/voting.js",
  "functions/_lib/fan-upload.js",
  "functions/api/vote.js",
  "functions/api/fan-vote.js",
  "functions/api/vote/status.js",
  "functions/api/fan-burgers.js",
  "functions/api/fan-burgers/status.js"
]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relative)], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Syntax check failed for ${relative}\n${result.stderr || result.stdout}`);
  }
}

const exportResult = spawnSync(process.execPath, ["scripts/export-d1-sql.cjs"], {
  cwd: root,
  encoding: "utf8"
});
if (exportResult.status !== 0) {
  throw new Error(`D1 export failed\n${exportResult.stderr || exportResult.stdout}`);
}

const seedSql = fs.readFileSync(path.join(root, "data/seed-burgers.sql"), "utf8");
if (/INSERT\s+OR\s+REPLACE/i.test(seedSql)) {
  throw new Error("Seed SQL must not use INSERT OR REPLACE because it overwrites live vote stats");
}
for (const mutable of ["elo", "wins", "losses", "bracket_wins", "approved", "created_at"]) {
  if (new RegExp(`${mutable}\\s*=\\s*excluded\\.`, "i").test(seedSql)) {
    throw new Error(`Seed SQL must not update live-owned column ${mutable}`);
  }
}

const resetSql = fs.readFileSync(path.join(root, "migrations/0003_launch_reset.sql"), "utf8");
if (!/DELETE\s+FROM\s+vote_ip_daily/i.test(resetSql)) {
  throw new Error("Launch reset must clear vote_ip_daily throttle rows");
}

for (const relative of fs.readdirSync(path.join(root, "scripts/linux")).filter((name) => name.endsWith(".sh"))) {
  const result = spawnSync("bash", ["-n", path.join(root, "scripts/linux", relative)], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Shell syntax check failed for scripts/linux/${relative}\n${result.stderr || result.stdout}`);
  }
}

(async () => {
  const voting = await import(path.join(root, "functions/_lib/voting.js"));
  const reset = voting.nextResetIso(new Date("2026-05-28T23:00:00.000Z"));
  if (reset !== "2026-05-29T04:00:00.000Z") {
    throw new Error(`Expected Eastern midnight reset, got ${reset}`);
  }
  const gate = await voting.getVoteIpGate({
    DB: {
      prepare() {
        return {
          bind() {
            return {
              first() {
                throw new Error("no such table: vote_ip_daily");
              }
            };
          }
        };
      }
    },
    VOTE_SALT: "test"
  }, new Request("https://example.test/api/vote"), "official");
  if (!gate.allowed || !gate.skipIpRecord || voting.recordVoteIpStatement({}, gate) !== null) {
    throw new Error("Vote IP throttling should no-op safely before migration 0004 exists");
  }
  console.log(`Smoke test passed with ${burgers.length} burgers.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
