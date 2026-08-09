// Boot a built ROM in the arcade's own gameboy-emulator, headless, and prove
// it actually plays: the screen renders and the NOVA_STATE byte at 0xCF00
// leaves 0 (1 run started, 2 won, 3 lost). Catches games that compile to a
// clean 32KB ROM but freeze, black-screen, or never wire up the protocol.
//
// Usage: node playtest-rom.mjs <rom.gb> [frames]
// Prints a one-line JSON verdict. Exit 0 = playable, 1 = failed verification
// (a harness error is a failed verification too — the gate never soft-passes).
import "./emulator-shims.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NOVA_STATE_ADDR = 0xcf00;
// The emulator ships with the arcade; NOVA_EMULATOR overrides for worktrees
// that haven't run an install.
const EMULATOR = process.env.NOVA_EMULATOR || join(
  import.meta.dirname, "..", "..", "arcade",
  "node_modules", "gameboy-emulator", "dist", "gameboy.js",
);

function pressFor(input, frame) {
  // Mash through title screens, then wiggle so a started run visibly plays.
  const phase = frame % 120;
  input.isPressingStart = phase < 20;
  input.isPressingA = phase >= 30 && phase < 50;
  input.isPressingRight = phase >= 60 && phase < 90;
  input.isPressingLeft = phase >= 90;
}

function screenSignature(gpu) {
  const data = gpu?.screen?.data;
  if (!data) return { distinct: 0, sum: 0 };
  const seen = new Set();
  let sum = 0;
  for (let i = 0; i < data.length; i += 97) {
    seen.add(data[i]);
    sum += data[i];
  }
  return { distinct: seen.size, sum };
}

async function playtestRom(romPath, frames) {
  const mod = (await import(EMULATOR)).default ?? (await import(EMULATOR));
  const Gameboy = mod.Gameboy ?? mod.gameboy?.Gameboy;
  const gb = new Gameboy();
  const rom = readFileSync(romPath);
  gb.loadGame(rom.buffer.slice(rom.byteOffset, rom.byteOffset + rom.byteLength));

  const statesSeen = new Set();
  let firstRunFrame = -1;
  let midSignature = null;
  for (let frame = 0; frame < frames; frame++) {
    pressFor(gb.input, frame);
    gb.runFrame();
    const state = gb.memory.readByte(NOVA_STATE_ADDR);
    statesSeen.add(state);
    if (firstRunFrame < 0 && state >= 1 && state <= 3) firstRunFrame = frame;
    if (frame === Math.floor(frames / 2)) midSignature = screenSignature(gb.gpu);
  }
  const endSignature = screenSignature(gb.gpu);

  const problems = [];
  if (firstRunFrame < 0) {
    problems.push(
      "NOVA_STATE at 0xCF00 never left 0: the game never registers a run " +
      "starting even with start/A mashed — the protocol writes are dead code " +
      "or the game is frozen",
    );
  }
  if (endSignature.distinct < 2 && (midSignature?.distinct ?? 0) < 2) {
    problems.push("the screen is blank: the ROM renders no visible pixels");
  }
  return {
    ok: problems.length === 0,
    problems,
    statesSeen: [...statesSeen].sort(),
    firstRunFrame,
    frames,
  };
}

const [romPath, framesArg] = process.argv.slice(2);
if (!romPath) {
  console.log(JSON.stringify({ ok: false, problems: ["no rom path given"] }));
  process.exit(1);
}
try {
  const verdict = await playtestRom(romPath, Number(framesArg) || 1800);
  console.log(JSON.stringify(verdict));
  process.exit(verdict.ok ? 0 : 1);
} catch (err) {
  console.log(JSON.stringify({ ok: false, problems: [`playtest harness error: ${String(err?.message ?? err).slice(0, 300)}`] }));
  process.exit(1);
}
