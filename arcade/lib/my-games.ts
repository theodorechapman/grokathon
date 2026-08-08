const KEY = "nova-my-games";

export function myGameSlugs(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function rememberMyGame(slug: string): void {
  try {
    const list = myGameSlugs().filter((s) => s !== slug);
    list.unshift(slug);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // storage unavailable (private mode); the game still exists globally
  }
}
