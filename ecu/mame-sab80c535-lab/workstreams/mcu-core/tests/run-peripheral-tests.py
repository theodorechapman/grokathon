#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

import argparse
import hashlib
import subprocess
from pathlib import Path

EXPECTED_SHA256 = "2bb851311dc830552afaa21a5225d60131a420d4e7860d4f21f9c9ac532eaace"


def parse_args() -> argparse.Namespace:
    workstream = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--mame", type=Path, default=Path("/tmp/mame-motronic-mcu-core/motronic175"))
    parser.add_argument("--run-dir", type=Path, default=Path("/tmp/mame-motronic-mcu-core-test"))
    parser.add_argument("--test-rom", type=Path, default=Path("/tmp/sab80c515-test.bin"))
    parser.add_argument("--log", type=Path, default=workstream / "logs" / "peripheral-tests.log")
    return parser.parse_args()


def prepare_rom(run_dir: Path, source: Path) -> None:
    destination = run_dir / "roms" / "sab515test" / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() or destination.is_symlink():
        destination.unlink()
    destination.symlink_to(source)


def main() -> None:
    args = parse_args()
    test_rom = args.test_rom
    digest = hashlib.sha256(test_rom.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise AssertionError(f"test ROM SHA-256 mismatch: {digest}")
    if not args.mame.is_file():
        raise AssertionError(f"MAME binary is absent: {args.mame}")

    prepare_rom(args.run_dir, test_rom)
    command = [
        str(args.mame),
        "sab515test",
        "-rompath", str(args.run_dir / "roms"),
        "-cfg_directory", str(args.run_dir / "cfg"),
        "-video", "none",
        "-sound", "none",
        "-nothrottle",
        "-nosleep",
        "-nowriteconfig",
        "-skip_gameinfo",
        "-oslog",
    ]
    result = subprocess.run(command, text=True, capture_output=True, timeout=20, check=False)
    output = result.stdout + result.stderr
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(output, encoding="utf-8")

    if result.returncode:
        raise AssertionError(f"MAME exited with {result.returncode}; see {args.log}")
    if "SAB515TEST result=00" not in output:
        raise AssertionError(f"peripheral self-test failed; see {args.log}")
    if "SAB515TEST timeout" in output:
        raise AssertionError(f"peripheral self-test timed out; see {args.log}")
    if "unmapped sfr memory" in output.lower():
        raise AssertionError(f"self-test found an unmapped SFR; see {args.log}")
    print("PASS: SAB80C515 reset, SFR, bit, timer, ADC, watchdog, and interrupt tests")


if __name__ == "__main__":
    main()
