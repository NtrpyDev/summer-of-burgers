/**
 * Test X API — same call as official quickstart:
 * https://docs.x.com/x-api/getting-started/make-your-first-request
 */
require("./load-env.cjs");
const { Client } = require("@xdevplatform/xdk");

async function main() {
  const token = (process.env.X_BEARER_TOKEN || "").trim();
  if (!token) {
    console.error("X_BEARER_TOKEN is empty in .env");
    process.exit(1);
  }

  console.log("Testing (official SDK + api.x.com)...\n");

  try {
    const client = new Client({ bearerToken: token });
    const response = await client.users.getByUsername("BarstoolBigCat", {
      "user.fields": ["id", "username"]
    });
    console.log("OK — API is working.");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("FAILED:", error.message || error);
    console.error(`
Fix (from X docs):
1. console.x.com → summer-of-burgers → Keys and tokens
2. If you regenerated API Key & Secret, also Regenerate Bearer Token
3. Paste Bearer into .env as X_BEARER_TOKEN=...
4. Test in browser/docs curl:
   curl "https://api.x.com/2/users/by/username/BarstoolBigCat" -H "Authorization: Bearer YOUR_TOKEN"
5. Run: .\\scripts\\check-x-api.cmd

Docs: https://docs.x.com/x-api/getting-started/make-your-first-request
`);
    process.exit(1);
  }
}

main();
