const { Client } = require("ssh2");

const [host, user, password, ...commandParts] = process.argv.slice(2);
const command = commandParts.join(" ") || "echo ok";

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(command, (err, stream) => {
      if (err) {
        console.error(err.message);
        conn.end();
        process.exit(1);
        return;
      }
      let out = "";
      let errOut = "";
      stream.on("data", (chunk) => {
        out += chunk.toString();
      });
      stream.stderr.on("data", (chunk) => {
        errOut += chunk.toString();
      });
      stream.on("close", (code) => {
        if (out) process.stdout.write(out);
        if (errOut) process.stderr.write(errOut);
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  })
  .connect({
    host,
    username: user,
    password
  });
