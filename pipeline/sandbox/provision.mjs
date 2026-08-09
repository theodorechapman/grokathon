// Boot a Vercel Sandbox microVM with the Nova toolchain: GBDK-2020 (lcc) and
// the official Grok Build CLI. A snapshot id (NOVA_SANDBOX_SNAPSHOT_ID) skips
// provisioning for sub-second startup.
import { Sandbox } from "@vercel/sandbox";

const GBDK_URL =
  "https://github.com/gbdk-2020/gbdk-2020/releases/download/4.5.0/gbdk-linux64.tar.gz";

export const PROVISION_STEPS = [
  { label: "install gbdk", cmd: `curl -sL ${GBDK_URL} | tar xz -C /opt && test -x /opt/gbdk/bin/lcc` },
  { label: "install grok cli", cmd: "npm i -g @xai-official/grok >/dev/null 2>&1 && grok --version" },
];

export async function provisionSandbox({ credentials, snapshotId, name, timeoutMs = 900000, onStep }) {
  if (snapshotId) {
    const params = {
      ...credentials,
      source: { type: "snapshot", snapshotId },
      timeout: timeoutMs,
    };
    // A name makes the microVM reattachable: prewarm boots it, the build
    // reconnects via getOrCreate and skips the cold start; if the warm VM
    // already expired, getOrCreate transparently boots a fresh one.
    return name ? Sandbox.getOrCreate({ ...params, name }) : Sandbox.create(params);
  }
  const sandbox = await Sandbox.create({ ...credentials, runtime: "node24", timeout: timeoutMs });
  try {
    for (const step of PROVISION_STEPS) {
      onStep?.(step.label);
      const run = await sandbox.runCommand("sh", ["-c", step.cmd]);
      if (run.exitCode !== 0) {
        throw new Error(`provision ${step.label} failed: ${(await run.stderr()).slice(-400)}`);
      }
    }
  } catch (err) {
    await sandbox.stop().catch(() => {});
    throw err;
  }
  return sandbox;
}
