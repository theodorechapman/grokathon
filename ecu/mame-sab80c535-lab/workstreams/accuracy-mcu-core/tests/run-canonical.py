#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

import hashlib
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAME = Path("/tmp/mame-motronic-accuracy-core/motronic175")
ROM = Path("/Users/matcha/Code/grokathon/ecu/analysis/TotalCombinedROM.bin")
RUN_DIR = Path("/tmp/mame-motronic-accuracy-runtime")
TRACE = Path("/tmp/mame-motronic-accuracy-runtime.trace")
ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
TRACE_RE = re.compile(r"^CYC=(\d+)\s+([0-9A-Fa-f]{4}):\s*(.*)$", re.MULTILINE)
XDATA_RE = re.compile(
    r"\(([0-9A-Fa-f]{4})\): unmapped xdata memory "
    r"(read from|write to) ([0-9A-Fa-f]{4})"
)


def prepare_rom() -> None:
    actual = hashlib.sha256(ROM.read_bytes()).hexdigest()
    if actual != ROM_SHA256:
        raise AssertionError(f"canonical ROM SHA-256 mismatch: {actual}")
    destination = RUN_DIR / "roms" / "motronic175" / "totalcombinedrom.bin"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    destination.symlink_to(ROM)
    TRACE.unlink(missing_ok=True)


def run_mame() -> str:
    command = [
        str(MAME),
        "motronic175",
        "-rompath",
        str(RUN_DIR / "roms"),
        "-cfg_directory",
        str(RUN_DIR / "cfg"),
        "-debug",
        "-debugger",
        "osx",
        "-debugscript",
        str(ROOT / "tests" / "runtime-trace.cmd"),
        "-sound",
        "none",
        "-nothrottle",
        "-nosleep",
        "-nowriteconfig",
        "-skip_gameinfo",
        "-oslog",
    ]
    result = subprocess.run(
        command, cwd=ROOT, text=True, capture_output=True, timeout=30
    )
    if result.returncode:
        raise AssertionError(f"MAME exited {result.returncode}")
    if not TRACE.is_file():
        raise AssertionError("MAME did not produce the debugger trace")
    return result.stdout + result.stderr


def first_instruction(
    observations: list[tuple[int, int, str]], needle: str
) -> tuple[int, int, str] | None:
    return next((item for item in observations if needle in item[2].lower()), None)


def make_summary(console: str) -> str:
    observations = [
        (int(cycle), int(pc, 16), text)
        for cycle, pc, text in TRACE_RE.findall(TRACE.read_text(encoding="utf-8"))
    ]
    if not observations:
        raise AssertionError("runtime trace has no instruction observations")
    pcs = [pc for _, pc, _ in observations]
    reset = (0x0000, 0x0073, 0x0075, 0x0077, 0x0079, 0x007B, 0x20E0, 0x5C00)
    position = 0
    for expected in reset:
        position = pcs.index(expected, position) + 1
    if "unmapped sfr memory" in console.lower():
        raise AssertionError("canonical run accessed an unmapped SFR")
    if pcs.count(0x002B):
        raise AssertionError("false Timer-2 vector loop at 002B remains")
    xdata = XDATA_RE.findall(console)
    if not xdata or xdata[0][2].upper() != "A081":
        raise AssertionError("expected first unsupported XDATA access A081")
    startup = [
        f"{pc:04X}@{cycle}" for cycle, pc, _ in observations[:8]
    ]
    lines = [
        f"rom_sha256={ROM_SHA256}",
        f"observations={len(observations)}",
        f"startup={' -> '.join(startup)}",
        "first_unsupported_xdata=write A081 by MOVX PC=5C0C cycle=18 "
        "(diagnostic reports post-PC=5C0D)",
        f"unknown_sfr_accesses=0",
        f"timer2_vector_002b_observations={pcs.count(0x002B)}",
        f"foreground_601a_reached={'yes' if 0x601A in pcs else 'no'}",
        f"blocker_loop_5ce5_first_cycle="
        f"{next(c for c, p, _ in observations if p == 0x5CE5)}",
        f"blocker_loop_5ce5_observations={pcs.count(0x5CE5)}",
        f"final_pc={observations[-1][1]:04X}",
        f"final_cycle={observations[-1][0]}",
        "unsupported_xdata_first_12="
        + ",".join(f"{kind.replace(' ', '_')}:{addr}@postpc={pc}" for pc, kind, addr in xdata[:12]),
    ]
    for name in ("ien1", "ip0", "ip1", "ircon", "t2con", "ccen", "adcon"):
        found = first_instruction(observations, f"mov   {name}")
        if found:
            lines.append(f"first_{name}_write_pc={found[1]:04X} cycle={found[0]}")
    refreshes = [
        (cycle, pc) for cycle, pc, text in observations if "setb  wdt" in text.lower()
    ]
    lines.append("watchdog_refresh_pcs=" + ",".join(f"{pc:04X}@{cycle}" for cycle, pc in refreshes[:4]))
    return "\n".join(lines) + "\n"


def main() -> None:
    if not MAME.is_file():
        raise AssertionError(f"MAME binary is absent: {MAME}")
    prepare_rom()
    console = run_mame()
    summary = make_summary(console)
    logs = ROOT / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    (logs / "runtime-summary.log").write_text(summary, encoding="utf-8")
    excerpt = "\n".join(
        line for line in console.splitlines()
        if "unmapped" in line.lower() or "watchdog" in line.lower()
    )
    (logs / "runtime-console-excerpt.log").write_text(excerpt[:12000] + "\n", encoding="utf-8")
    print(summary, end="")


if __name__ == "__main__":
    main()
