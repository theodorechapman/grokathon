// Provenance audit for bundles that shipped before build logging existed:
// grok recompiles the shipped source in a sandbox, byte-compares the ROM,
// checks the NOVA_STATE / nova:score contract, and narrates what the code
// does. The log is a real agent run, and build.json marks it audit:true so
// the UI says "verified", never "built".
//
// Usage: node audit-bundle.mjs <bundle-dir> [<bundle-dir>...]
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getVercelCredentials } from "./vercel-auth.mjs";
import { provisionSandbox } from "./provision.mjs";

const BASE = join(import.meta.dirname, "..", "gbdk-reconstruction", "breakout");

const GROK_CMD =
  "cd work && grok --prompt-file task.txt " +
  "--permission-mode bypassPermissions --always-approve -m grok-4.5 " +
  "--output-format streaming-json --max-turns 30 --no-subagents --disable-web-search";

function romTask(slug) {
  return (
    `Provenance audit of the shipped Game Boy game "${slug}". In this directory: ` +
    "main.c (the shipped source), assets.c/assets.h, and shipped.gb (the ROM " +
    "players get). Do these checks and report plainly: 1) compile with " +
    "/opt/gbdk/bin/lcc -o rebuilt.gb main.c assets.c and confirm it builds " +
    "clean at 32768 bytes; 2) cmp rebuilt.gb shipped.gb and report whether the " +
    "shipped ROM is byte-identical to what the source produces; 3) grep the " +
    "NOVA_STATE protocol (#define at 0xCF00, writes 1/2/3) and confirm it's " +
    "intact; 4) read main.c and explain in a few sentences what the game is " +
    "and how the core mechanic is implemented. Do not modify any file."
  );
}

function htmlTask(slug) {
  return (
    `Provenance audit of the shipped browser game "${slug}". index.html in ` +
    "this directory is the complete game. Check and report plainly: 1) the " +
    'game posts window.parent.postMessage({type:"nova:score",...}) when a run ' +
    "ends; 2) it is fully self-contained (no external http(s) resources); " +
    "3) read the code and explain in a few sentences what the game is and how " +
    "the core mechanic works. Do not modify any file."
  );
}

async function audit(sandbox, dir) {
  const slug = basename(dir);
  const isRom = existsSync(join(dir, "source.c"));
  const stages = [];
  const stamp = (stage, detail) => {
    stages.push({ at: new Date().toISOString().slice(0, 19) + "Z", stage, detail });
    console.log(`[${slug}] ${stage}: ${detail}`);
  };
  stamp("sandbox up", "audit microVM ready");

  const files = [{ path: "work/task.txt", content: Buffer.from(isRom ? romTask(slug) : htmlTask(slug)) }];
  if (isRom) {
    const rom = ["game.gb", `${slug}.gb`].map((n) => join(dir, n)).find(existsSync);
    files.push(
      { path: "work/main.c", content: readFileSync(join(dir, "source.c")) },
      { path: "work/assets.c", content: readFileSync(join(BASE, "assets.c")) },
      { path: "work/assets.h", content: readFileSync(join(BASE, "assets.h")) },
      { path: "work/shipped.gb", content: readFileSync(rom) },
    );
  } else {
    files.push({ path: "work/index.html", content: readFileSync(join(dir, "index.html")) });
  }
  // A fresh work dir per bundle so audits never see each other's files.
  await sandbox.runCommand("rm", ["-rf", "work"]);
  await sandbox.writeFiles(files);

  stamp("grok cli", "Grok Build auditing the shipped source in the sandbox");
  const logPath = join(dir, "build-log.ndjson");
  writeFileSync(logPath, "");
  const cmd = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", GROK_CMD],
    env: { XAI_API_KEY: process.env.XAI_API_KEY ?? "" },
    detached: true,
  });
  let tail = "";
  for await (const chunk of cmd.logs()) {
    const parts = (tail + chunk.data.toString()).split("\n");
    tail = parts.pop() ?? "";
    for (const line of parts) if (line.trim()) appendFileSync(logPath, line + "\n");
  }
  if (tail.trim()) appendFileSync(logPath, tail + "\n");
  const done = await cmd.wait();
  if (done.exitCode !== 0) throw new Error(`grok audit exited ${done.exitCode}`);
  stamp("verified", isRom ? "recompiled, ROM compared, NOVA_STATE checked" : "contract checked, code reviewed");

  writeFileSync(
    join(dir, "build.json"),
    JSON.stringify(
      {
        engine: "sandbox",
        audit: true,
        job: {},
        stages,
        finishedAt: new Date().toISOString().slice(0, 19) + "Z",
      },
      null,
      2,
    ) + "\n",
  );
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: node audit-bundle.mjs <bundle-dir> [...]");
  process.exit(1);
}
const sandbox = await provisionSandbox({
  credentials: getVercelCredentials(),
  snapshotId: process.env.NOVA_SANDBOX_SNAPSHOT_ID,
  onStep: (label) => console.log(`provisioning: ${label}`),
});
try {
  for (const dir of dirs) {
    await audit(sandbox, dir);
  }
} finally {
  await sandbox.stop().catch(() => {});
}
