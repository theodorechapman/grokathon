#!/usr/bin/env python3
"""Verify the combined SAB80C515 core and evidence-bounded XDATA model."""

import argparse
import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HARNESS_PATH = ROOT / "runtime-harness.py"
HARNESS_SPEC = importlib.util.spec_from_file_location(
    "runtime_harness", HARNESS_PATH
)
if not HARNESS_SPEC or not HARNESS_SPEC.loader:
    raise RuntimeError(f"cannot load runtime harness: {HARNESS_PATH}")
runtime_harness = importlib.util.module_from_spec(HARNESS_SPEC)
HARNESS_SPEC.loader.exec_module(runtime_harness)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mame",
        type=Path,
        default=Path("/tmp/mame-motronic-mcu-core/motronic175"),
    )
    parser.add_argument(
        "--rom",
        type=Path,
        default=ROOT / "../../../analysis/TotalCombinedROM.bin",
    )
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=Path("/tmp/mame-motronic-combined-run"),
    )
    return parser.parse_args()


def verify_core(mame: Path) -> None:
    test = ROOT.parent / "mcu-core" / "tests" / "run-peripheral-tests.py"
    subprocess.run(
        [sys.executable, str(test), "--mame", str(mame)],
        check=True,
        timeout=20,
    )


def run_case(
    runner: object,
    name: str,
    settings: dict[str, str],
) -> tuple[dict, str]:
    parsed, output = runner.run(settings)
    (ROOT / f"runtime-combined-{name}.log").write_text(output, encoding="utf-8")
    if "unmapped sfr memory" in output.lower():
        raise AssertionError(f"{name} accessed an unmapped SFR")
    return parsed, output


def verify_strict(case: dict) -> None:
    execution = case["execution"]
    xdata = case["xdata"]
    if xdata["first_unknown_addr"] != "a040":
        raise AssertionError("strict run did not stop at XDATA A040")
    if xdata["first_unknown_pc"] != "5cea":
        raise AssertionError("strict run reached A040 from an unexpected PC")
    if execution["timer2_entries"] != "0":
        raise AssertionError("strict run regressed into the Timer-2 vector")
    if execution["startup_frontier"] != "5cea":
        raise AssertionError("strict startup frontier changed")


def verify_approximation(first: dict, repeated: dict) -> None:
    for case in (first, repeated):
        execution = case["execution"]
        if execution["reason"] != "cycle-timeout":
            raise AssertionError("approximate run did not reach its time bound")
        if int(execution["startup_frontier"], 16) < 0x5D0D:
            raise AssertionError("approximate run did not pass XDATA startup")
        if execution["init_entries"] != "1":
            raise AssertionError("approximate run restarted")
        if int(execution["supervisor_entries"]) < 1:
            raise AssertionError("approximate run did not reach the supervisor")
        if int(execution["timer1_entries"]) < 1:
            raise AssertionError("approximate run did not service Timer 1")
        if int(execution["timer2_entries"]) > 32:
            raise AssertionError("approximate run regressed into a Timer-2 storm")
    if runtime_harness.signature(first) != runtime_harness.signature(repeated):
        raise AssertionError("identical combined runs were not deterministic")


def main() -> None:
    args = parse_args()
    mame = args.mame.resolve()
    rom = args.rom.resolve()
    if not mame.is_file():
        raise AssertionError(f"MAME target absent: {mame}")
    if runtime_harness.digest(rom) != runtime_harness.ROM_SHA256:
        raise AssertionError("canonical ROM identity mismatch")

    verify_core(mame)
    runner = runtime_harness.Runner(mame, rom, args.run_dir)
    strict, _ = run_case(runner, "strict", {"MOTRONIC_XRAM_RESET": "zero"})
    settings = {
        "MOTRONIC_XRAM_RESET": "zero",
        "MOTRONIC_UNKNOWN_POLICY": "value",
        "MOTRONIC_UNKNOWN_VALUE": "00",
        "MOTRONIC_TIMEOUT_MS": "800",
        "MOTRONIC_INSTRUCTION_LIMIT": "1000000",
    }
    approximate, _ = run_case(runner, "approx-zero", settings)
    repeated, _ = run_case(runner, "approx-zero-repeat", settings)
    verify_strict(strict)
    verify_approximation(approximate, repeated)
    execution = approximate["execution"]
    print(
        "PASS: combined MCU/XDATA model; "
        f"startup_frontier={execution['startup_frontier']} "
        f"supervisor_entries={execution['supervisor_entries']} "
        f"timer1_entries={execution['timer1_entries']} "
        f"instructions={execution['instructions']} "
        f"timer2_entries={execution['timer2_entries']}"
    )


if __name__ == "__main__":
    main()
