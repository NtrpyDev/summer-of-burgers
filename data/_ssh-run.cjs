const { Client } = require("ssh2");
const [host, user, password, ...parts] = process.argv.slice(2);
const cmd = parts.join(" ");
const conn = new Client();
conn.on("ready", () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err.message); process.exit(1); }
    stream.on("data", (d) => process.stdout.write(d));
    stream.stderr.on("data", (d) => process.stderr.write(d));
    stream.on("close", (c) => { conn.end(); process.exit(c || 0); });
  });
}).on("error", (e) => { console.error(e.message); process.exit(1); })
  .connect({ host, username: user, password });
