#!/usr/bin/env python3
"""Run the generated external-capture ROM against an integrated MAME binary."""

import argparse
import hashlib
import subprocess
from pathlib import Path

EXPECTED_SHA256 = "17c103883c18331b799ec25f560f7bb0a780878093dfd4d139eb845a1cfd8dd0"


def _arguments() -> argparse.Namespace:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--mame", type=Path, required=True)
    parser.add_argument(
        "--rom",
        type=Path,
        default=root / "artifacts" / "sab80c515-capture-test.bin",
    )
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument(
        "--log",
        type=Path,
        default=root / "artifacts" / "capture-test.log",
    )
    return parser.parse_args()


def run_capture_test(args: argparse.Namespace) -> None:
    if not args.mame.is_file():
        raise AssertionError(f"MAME binary is absent: {args.mame}")
    digest = hashlib.sha256(args.rom.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise AssertionError(f"capture ROM SHA-256 mismatch: {digest}")

    rom_dir = args.run_dir / "roms" / "sab515cap"
    rom_dir.mkdir(parents=True, exist_ok=True)
    destination = rom_dir / "sab80c515-capture-test.bin"
    if destination.exists() or destination.is_symlink():
        destination.unlink()
    destination.symlink_to(args.rom.resolve())
    command = [
        str(args.mame),
        "sab515cap",
        "-rompath",
        str(args.run_dir / "roms"),
        "-cfg_directory",
        str(args.run_dir / "cfg"),
        "-video",
        "none",
        "-sound",
        "none",
        "-nothrottle",
        "-nosleep",
        "-nowriteconfig",
        "-skip_gameinfo",
        "-oslog",
    ]
    result = subprocess.run(
        command,
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    output = result.stdout + result.stderr
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(output, encoding="utf-8")
    if result.returncode:
        raise AssertionError(f"MAME exited with {result.returncode}; see {args.log}")
    if "SAB515CAP result=00 transitions=4" not in output:
        raise AssertionError(f"external capture oracle failed; see {args.log}")
    if "SAB515CAP timeout" in output:
        raise AssertionError(f"external capture oracle timed out; see {args.log}")
    if "unmapped sfr memory" in output.lower():
        raise AssertionError(f"capture test found unmapped SFR access; see {args.log}")


def main() -> None:
    args = _arguments()
    run_capture_test(args)
    print("PASS: CC0 edge, capture delta, request clear, and vector ordering")


if __name__ == "__main__":
    main()
