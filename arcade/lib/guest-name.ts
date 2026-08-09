const ADJECTIVES = [
  "neon", "turbo", "pixel", "cosmic", "sneaky", "rapid", "mellow", "crispy",
  "shiny", "rowdy", "quiet", "wild", "lucky", "salty", "fuzzy", "bouncy",
  "chrome", "midnight", "solar", "retro", "glitchy", "smooth", "spicy", "frosty",
  "electric", "hyper", "lazy", "brave", "sly", "zesty", "mystic", "atomic",
];

const ANIMALS = [
  "badger", "falcon", "otter", "mantis", "gecko", "walrus", "lynx", "raven",
  "beetle", "shark", "panda", "cobra", "moose", "ferret", "heron", "bison",
  "toad", "wombat", "viper", "crane", "dingo", "newt", "puffin", "stoat",
  "iguana", "magpie", "tapir", "urchin", "weasel", "yak", "osprey", "marmot",
];

/**
 * Deterministic display name from an anon id: same visitor reads as the same
 * name everywhere with no storage and no signup. The hex tail keeps two
 * neon-badgers apart.
 */
export function guestDisplayName(anonId: string): string {
  let h = 0;
  for (let i = 0; i < anonId.length; i++) {
    h = (h * 31 + anonId.charCodeAt(i)) >>> 0;
  }
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const animal = ANIMALS[(h >>> 5) % ANIMALS.length];
  return `${adj}-${animal}-${anonId.slice(0, 2)}`;
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,14}[a-zA-Z0-9]$/;
const BLOCKED = ["nigg", "fag", "rape", "hitler", "kys", "cunt", "retard"];

export function validGuestName(name: string): boolean {
  if (!NAME_RE.test(name)) return false;
  const flat = name.toLowerCase().replace(/[^a-z]/g, "");
  return !BLOCKED.some((w) => flat.includes(w));
}
