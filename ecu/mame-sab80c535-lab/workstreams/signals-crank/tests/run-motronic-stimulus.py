#!/usr/bin/env python3
"""Run one generated trace twice through the combined Motronic driver."""

import argparse
import hashlib
import os
import re
import subprocess
from pathlib import Path

ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
FIELDS = re.compile(r"(\w+)=([^\s]+)")


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mame", type=Path, required=True)
    parser.add_argument("--rom", type=Path, required=True)
    parser.add_argument("--trace", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--board-scenario", default="off")
    parser.add_argument("--adc-profile", default="key-on")
    return parser.parse_args()


def _trace_contract(path: Path) -> tuple[int, int]:
    rows = [
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#")
    ]
    if not rows:
        raise AssertionError("trace contains no transitions")
    cycles = [int(row.split(",", 1)[0]) for row in rows]
    return len(rows), cycles[-1]


def _prepare_rom(run_dir: Path, rom: Path) -> None:
    destination = run_dir / "roms" / "motronic175" / "totalcombinedrom.bin"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    destination.symlink_to(rom.resolve())
    (run_dir / "cfg").mkdir(parents=True, exist_ok=True)


def _run(
    args: argparse.Namespace,
    timeout_ms: int,
) -> tuple[dict[str, str], str]:
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("MOTRONIC_")
    }
    environment.update(
        {
            "MOTRONIC_CRANK_TRACE": str(args.trace.resolve()),
            "MOTRONIC_XRAM_RESET": "zero",
            "MOTRONIC_UNKNOWN_POLICY": "value",
            "MOTRONIC_UNKNOWN_VALUE": "00",
            "MOTRONIC_TIMEOUT_MS": str(timeout_ms),
            "MOTRONIC_INSTRUCTION_LIMIT": "10000000",
            "MOTRONIC_CONTINUE_FOREGROUND": "1",
            "MOTRONIC_SIGNAL_SCENARIO": args.board_scenario,
            "MOTRONIC_ADC_PROFILE": args.adc_profile,
        }
    )
    command = [
        str(args.mame),
        "motronic175",
        "-rompath",
        str(args.run_dir / "roms"),
        "-cfg_directory",
        str(args.run_dir / "cfg"),
        "-sound",
        "none",
        "-video",
        "none",
        "-nothrottle",
        "-nosleep",
        "-nowriteconfig",
        "-skip_gameinfo",
        "-oslog",
    ]
    result = subprocess.run(
        command,
        cwd=args.run_dir,
        env=environment,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    output = result.stdout + result.stderr
    if result.returncode:
        raise AssertionError(f"MAME exited {result.returncode}: {output[-1000:]}")
    summaries = [line for line in output.splitlines() if "ESUMMARY" in line]
    if len(summaries) != 1:
        raise AssertionError(f"expected one ESUMMARY, found {len(summaries)}")
    return dict(FIELDS.findall(summaries[0])), output


def main() -> None:
    args = _arguments()
    if hashlib.sha256(args.rom.read_bytes()).hexdigest() != ROM_SHA256:
        raise AssertionError("canonical ROM SHA-256 mismatch")
    expected_transitions, last_cycle = _trace_contract(args.trace)
    _prepare_rom(args.run_dir, args.rom)
    timeout_ms = max(800, last_cycle // 1000 + 100)
    first, first_log = _run(args, timeout_ms)
    second, second_log = _run(args, timeout_ms)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(first_log + "\n--- repeat ---\n" + second_log)
    if int(first["crank_transitions"]) != expected_transitions:
        raise AssertionError("not every scheduled pin transition was applied")
    if first != second:
        raise AssertionError("identical crank runs produced different summaries")
    print(
        "PASS: deterministic Motronic stimulus; "
        f"transitions={expected_transitions} "
        f"capture_entries={first['capture_entries']}"
    )


if __name__ == "__main__":
    main()
