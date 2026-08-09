// Resolve Vercel Sandbox credentials: explicit env wins, otherwise the local
// Vercel CLI login + the arcade's linked project.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function getVercelCredentials() {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = process.env;
  if (VERCEL_TOKEN && VERCEL_TEAM_ID && VERCEL_PROJECT_ID) {
    return { token: VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, projectId: VERCEL_PROJECT_ID };
  }
  try {
    // CLI OAuth tokens expire; any CLI call refreshes auth.json. Best-effort:
    // if the CLI is missing we still try the token on disk.
    execFileSync("vercel", ["whoami"], { stdio: "ignore", timeout: 15000 });
  } catch {}
  const auth = JSON.parse(
    readFileSync(join(homedir(), "Library/Application Support/com.vercel.cli/auth.json"), "utf8"),
  );
  // .vercel/ is gitignored, so worktrees don't have it — fall back to the
  // runner's main clone.
  const candidates = [
    join(REPO, "arcade", ".vercel", "project.json"),
    join(homedir(), "grokathon", "grokathon", "arcade", ".vercel", "project.json"),
  ];
  const found = candidates.find((p) => { try { readFileSync(p); return true; } catch { return false; } });
  if (!found) throw new Error("no linked Vercel project: run `vercel link` in arcade/");
  const project = JSON.parse(readFileSync(found, "utf8"));
  if (!auth.token) throw new Error("no Vercel token: run `vercel login` or set VERCEL_TOKEN");
  return { token: auth.token, teamId: project.orgId, projectId: project.projectId };
}
