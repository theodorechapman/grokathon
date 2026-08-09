// Build one Nova game inside a Vercel Sandbox by driving the official Grok
// Build CLI as the coding agent: it rewrites main.c, compiles with GBDK's lcc,
// and iterates until a clean 32KB ROM builds. Stage + log events stream to
// stdout as NDJSON for the runner to forward and persist.
//
// Usage: node build-in-sandbox.mjs <spec.json>
// Spec: { slug, task, srcDir, outDir, attempts? } — srcDir holds main.c,
// assets.c, assets.h; artifacts land in outDir (main.c, <slug>.gb,
// build-log.ndjson). Exit 0 = verified ROM in outDir.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getVercelCredentials } from "./vercel-auth.mjs";
import { provisionSandbox } from "./provision.mjs";

const LCC = "/opt/gbdk/bin/lcc";
const WORK = "work";

function emit(event) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// bypassPermissions + always-approve: the microVM is the security boundary.
// The task reaches grok via --prompt-file, never through shell interpolation —
// X prompts are attacker-controlled and $(...) in an sh -c string would run.
const GROK_CMD =
  `cd ${WORK} && grok --prompt-file task.txt ` +
  "--permission-mode bypassPermissions --always-approve -m grok-4.5 " +
  "--output-format streaming-json --max-turns 80 --no-subagents --disable-web-search";

async function streamGrok(sandbox, task, logPath) {
  await sandbox.writeFiles([{ path: `${WORK}/task.txt`, content: Buffer.from(task) }]);
  const cmd = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", GROK_CMD],
    env: { XAI_API_KEY: process.env.XAI_API_KEY ?? "" },
    detached: true,
  });
  for await (const line of cmd.logs()) {
    const text = line.data.toString().trimEnd();
    if (!text) continue;
    appendFileSync(logPath, text + "\n");
    emit({ event: "log", line: text.slice(0, 2000) });
  }
  const done = await cmd.wait();
  return done.exitCode;
}

async function verifyBuild(sandbox, slug) {
  // Never trust the agent's word for it: recompile fresh and check the contract.
  const check = await sandbox.runCommand("sh", [
    "-c",
    `cd ${WORK} && ${LCC} -o ${slug}.gb main.c assets.c && stat -c %s ${slug}.gb && grep -c NOVA_STATE main.c`,
  ]);
  if (check.exitCode !== 0) return ((await check.stderr()) + (await check.stdout())).slice(-1200);
  const [size, novaRefs] = (await check.stdout()).trim().split("\n").slice(-2);
  if (size !== "32768") return `unexpected ROM size ${size}`;
  if (Number(novaRefs) < 4) return "NOVA_STATE protocol writes are missing from main.c";
  return "";
}

async function main() {
  const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const { slug, task, srcDir, outDir } = spec;
  const attempts = spec.attempts ?? 3;
  mkdirSync(outDir, { recursive: true });
  const logPath = join(outDir, "build-log.ndjson");
  writeFileSync(logPath, "");

  emit({ event: "stage", stage: "sandbox up", detail: "booting a Vercel Sandbox microVM with GBDK + Grok Build CLI" });
  const sandbox = await provisionSandbox({
    credentials: getVercelCredentials(),
    snapshotId: process.env.NOVA_SANDBOX_SNAPSHOT_ID,
    onStep: (label) => emit({ event: "stage", stage: "sandbox up", detail: label }),
  });
  // The runner terminates us on timeout; stop the microVM before dying so it
  // doesn't burn compute until its own lifetime cap.
  process.on("SIGTERM", () => {
    sandbox.stop().catch(() => {}).finally(() => process.exit(1));
  });

  try {
    await sandbox.writeFiles(
      ["main.c", "assets.c", "assets.h"].map((name) => ({
        path: `${WORK}/${name}`,
        content: readFileSync(join(srcDir, name)),
      })),
    );
    let err = "";
    for (let attempt = 1; attempt <= attempts; attempt++) {
      emit({ event: "stage", stage: "grok cli", detail: `attempt ${attempt}: Grok Build rewriting main.c in the sandbox` });
      const fullTask = err
        ? `${task}\n\nThe previous attempt failed verification:\n${err}\nFix main.c and recompile until it passes.`
        : task;
      const exit = await streamGrok(sandbox, fullTask, logPath);
      if (exit !== 0) {
        err = `grok cli exited ${exit}`;
        emit({ event: "stage", stage: "grok cli", detail: err });
        continue;
      }
      emit({ event: "stage", stage: "compiling", detail: "verifying: fresh lcc build, 32KB ROM, NOVA_STATE intact" });
      err = await verifyBuild(sandbox, slug);
      if (!err) break;
      emit({ event: "stage", stage: "compiling", detail: `verification failed: ${err.split("\n").at(-1)}` });
    }
    if (err) throw new Error(`build failed after ${attempts} attempts: ${err}`);

    for (const name of ["main.c", `${slug}.gb`]) {
      const got = await sandbox.downloadFile(
        { path: `${WORK}/${name}` },
        { path: join(outDir, name === "main.c" ? "main.c" : `${slug}.gb`) },
        { mkdirRecursive: true },
      );
      if (!got) throw new Error(`artifact missing from sandbox: ${name}`);
    }
    emit({ event: "stage", stage: "sandbox done", detail: "artifacts downloaded, microVM shut down" });
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

main().catch((err) => {
  emit({ event: "error", detail: String(err.message ?? err) });
  process.exit(1);
});
