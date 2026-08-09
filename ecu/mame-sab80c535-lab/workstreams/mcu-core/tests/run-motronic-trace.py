#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

import argparse
import hashlib
import re
import subprocess
from pathlib import Path

ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
RESET_PATH = (0x0000, 0x0073, 0x0075, 0x0077, 0x0079, 0x007B, 0x20E0, 0x5C00)
TRACE_LINE = re.compile(r"^CYC=(\d+)\s+([0-9a-f]{4}):", re.IGNORECASE | re.MULTILINE)


def parse_args() -> argparse.Namespace:
    workstream = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--mame", type=Path, default=Path("/tmp/mame-motronic-mcu-core/motronic175"))
    parser.add_argument(
        "--rom",
        type=Path,
        default=workstream.parents[2] / "analysis" / "TotalCombinedROM.bin",
    )
    parser.add_argument("--run-dir", type=Path, default=Path("/tmp/mame-motronic-mcu-core-run"))
    parser.add_argument("--label", default="4ms")
    parser.add_argument(
        "--debugscript",
        type=Path,
        default=Path(__file__).with_name("trace-4ms.cmd"),
    )
    return parser.parse_args()


def prepare_rom(run_dir: Path, source: Path) -> None:
    destination = run_dir / "roms" / "motronic175" / "totalcombinedrom.bin"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() or destination.is_symlink():
        destination.unlink()
    destination.symlink_to(source)


def require_ordered_path(pcs: list[int]) -> None:
    position = 0
    for expected in RESET_PATH:
        position = pcs.index(expected, position) + 1


def main() -> None:
    args = parse_args()
    workstream = Path(__file__).resolve().parent.parent
    trace = workstream / "logs" / f"runtime-trace-{args.label}.log"
    console = workstream / "logs" / f"runtime-console-{args.label}.log"
    if hashlib.sha256(args.rom.read_bytes()).hexdigest() != ROM_SHA256:
        raise AssertionError("canonical ROM SHA-256 mismatch")
    prepare_rom(args.run_dir, args.rom)
    trace.unlink(missing_ok=True)

    command = [
        str(args.mame), "motronic175",
        "-rompath", str(args.run_dir / "roms"),
        "-cfg_directory", str(args.run_dir / "cfg"),
        "-debug", "-debugger", "osx",
        "-debugscript", str(args.debugscript),
        "-sound", "none", "-nothrottle", "-nosleep", "-nowriteconfig",
        "-skip_gameinfo", "-oslog",
    ]
    result = subprocess.run(
        command,
        cwd=workstream,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    output = result.stdout + result.stderr
    console.write_text(output, encoding="utf-8")
    if result.returncode:
        raise AssertionError(f"MAME exited with {result.returncode}")
    matches = TRACE_LINE.findall(trace.read_text(encoding="utf-8"))
    cycles = [int(cycle) for cycle, _ in matches]
    pcs = [int(pc, 16) for _, pc in matches]
    require_ordered_path(pcs)
    if "unmapped sfr memory" in output.lower():
        raise AssertionError("runtime still reports an unmapped SFR")
    if "unmapped xdata memory write to a081" not in output.lower():
        raise AssertionError("expected first external-device blocker A081 is absent")
    target = pcs.index(0x5C00)
    print(
        f"PASS: {len(pcs)} observations; 5C00 after {target} instructions "
        f"at cycle {cycles[target]}; final {pcs[-1]:04X} at cycle {cycles[-1]}"
    )


if __name__ == "__main__":
    main()
