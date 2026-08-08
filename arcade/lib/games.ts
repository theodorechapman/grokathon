import { readdir, readFile } from "fs/promises";
import path from "path";

export type GameManifest = {
  slug: string;
  title: string;
  description: string;
  controls: string;
  source: "rom-re" | "prompt-gen" | "remix";
  parent: string | null;
  createdAt: string;
};

const GAMES_DIR = path.join(process.cwd(), "public", "games");
const REQUIRED_KEYS: (keyof GameManifest)[] = [
  "slug",
  "title",
  "description",
  "controls",
  "source",
  "createdAt",
];

export async function listGames(): Promise<GameManifest[]> {
  const entries = await readdir(GAMES_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const games = await Promise.all(dirs.map((d) => readManifest(d.name)));
  return games.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getGame(slug: string): Promise<GameManifest | null> {
  try {
    return await readManifest(slug);
  } catch {
    return null;
  }
}

async function readManifest(slug: string): Promise<GameManifest> {
  const raw = await readFile(path.join(GAMES_DIR, slug, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as GameManifest;
  for (const key of REQUIRED_KEYS) {
    if (manifest[key] === undefined) {
      throw new Error(`games/${slug}/manifest.json missing "${key}" (see docs/game-bundle-contract.md)`);
    }
  }
  if (manifest.slug !== slug) {
    throw new Error(`games/${slug}: manifest slug "${manifest.slug}" doesn't match folder name`);
  }
  return manifest;
}
