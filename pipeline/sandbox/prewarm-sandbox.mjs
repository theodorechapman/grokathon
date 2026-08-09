// Boot a named Vercel Sandbox microVM from the Nova snapshot and leave it
// running so the next build attaches instantly instead of paying the cold
// start. The runner passes the name to build-in-sandbox.mjs via the spec;
// an unused warm VM self-terminates at its lifetime cap.
//
// Usage: node prewarm-sandbox.mjs <name>
// Prints {"event":"ready","name":...} NDJSON on success, exit 0.
import { getVercelCredentials } from "./vercel-auth.mjs";
import { provisionSandbox } from "./provision.mjs";

const name = process.argv[2];
if (!name) {
  console.error("usage: node prewarm-sandbox.mjs <name>");
  process.exit(2);
}
const snapshotId = process.env.NOVA_SANDBOX_SNAPSHOT_ID;
if (!snapshotId) {
  console.error("NOVA_SANDBOX_SNAPSHOT_ID is not set; nothing to prewarm");
  process.exit(2);
}

try {
  const sandbox = await provisionSandbox({
    credentials: getVercelCredentials(),
    snapshotId,
    name,
  });
  console.log(JSON.stringify({ event: "ready", name, sandboxId: sandbox.sandboxId }));
} catch (err) {
  console.log(JSON.stringify({ event: "error", detail: String(err?.message ?? err).slice(0, 300) }));
  process.exit(1);
}
