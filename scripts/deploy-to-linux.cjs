const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { Client } = require("ssh2");

const host = process.argv[2];
const user = process.argv[3];
const password = process.argv[4];
const remoteDir = process.argv[5] || "~/summer-of-burgers";

if (!password) {
  console.error("Usage: node scripts/deploy-to-linux.cjs HOST USER PASSWORD [REMOTE_DIR]");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const archive = path.join(root, "data", "deploy-bundle.tgz");
const excludes = ["node_modules", ".tools", ".cache", ".git", "data/deploy-bundle.tgz"];

fs.mkdirSync(path.dirname(archive), { recursive: true });
const tarArgs = excludes.flatMap((name) => ["--exclude", name]).join(" ");
execSync(`tar -czf "${archive}" ${tarArgs} -C "${root}" .`, { stdio: "inherit", shell: true });

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream.on("data", (c) => { out += c; });
      stream.stderr.on("data", (c) => { errOut += c; });
      stream.on("close", (code) => {
        if (code) reject(new Error(errOut || out || `exit ${code}`));
        else resolve(out);
      });
    });
  });
}

function sftpUpload(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => (err ? reject(err) : resolve()));
  });
}

const conn = new Client();
conn
  .on("ready", async () => {
    try {
      await exec(conn, `mkdir -p ${remoteDir}`);
      const sftp = await new Promise((resolve, reject) => {
        conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
      });
      await sftpUpload(sftp, archive, `${remoteDir}/deploy-bundle.tgz`);
      const envPath = path.join(root, ".env");
      if (fs.existsSync(envPath)) {
        await sftpUpload(sftp, envPath, `${remoteDir}/.env`);
      }
      const wranglerConfig = path.join(root, ".wrangler", "config", "default.toml");
      if (fs.existsSync(wranglerConfig)) {
        await exec(conn, `mkdir -p ${remoteDir}/.wrangler/config`);
        await sftpUpload(sftp, wranglerConfig, `${remoteDir}/.wrangler/config/default.toml`);
      }
      sftp.end();

      console.log("Extracting on server...");
      await exec(conn, `cd ${remoteDir} && tar -xzf deploy-bundle.tgz && rm deploy-bundle.tgz && chmod +x scripts/linux/*.sh`);
      console.log("Running install-server.sh...");
      const out = await exec(conn, `cd ${remoteDir} && bash scripts/linux/install-server.sh`);
      console.log(out);
      console.log(`Deployed to ${remoteDir}`);
      conn.end();
    } catch (error) {
      console.error(error.message);
      conn.end();
      process.exit(1);
    }
  })
  .on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  })
  .connect({ host, username: user, password });
