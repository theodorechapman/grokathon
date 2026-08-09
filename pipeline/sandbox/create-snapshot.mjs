// One-shot: provision a sandbox with the Nova toolchain and snapshot it.
// Run: node create-snapshot.mjs — then export NOVA_SANDBOX_SNAPSHOT_ID.
import { getVercelCredentials } from "./vercel-auth.mjs";
import { provisionSandbox } from "./provision.mjs";

const sandbox = await provisionSandbox({
  credentials: getVercelCredentials(),
  onStep: (label) => console.log(`provisioning: ${label}`),
});
try {
  const snapshot = await sandbox.snapshot();
  console.log(`snapshot ready. add to ~/sutrix/config/env/api-keys.env:`);
  console.log(`export NOVA_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
} finally {
  await sandbox.stop().catch(() => {});
}
