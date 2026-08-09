#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

import hashlib
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAME = Path("/tmp/mame-motronic-accuracy-core/motronic175")
RUN_DIR = Path("/tmp/mame-motronic-accuracy-tests")
ROMS = {
    "sab515test": (
        "sab80c515-conformance.bin",
        "32cce0def9bd1b1d49d2c6d8c2f5ebf0026ba324e3068df9840832d41253fdb8",
    ),
    "sab515wdt": (
        "sab80c515-watchdog.bin",
        "46f18aed6fe90d7027b22edf3eb35fc4d8967bc92f7cbced42ab4604cd1a9fa3",
    ),
}


def prepare_rom(system: str, name: str, expected: str) -> None:
    source = ROOT / "tests" / name
    actual = hashlib.sha256(source.read_bytes()).hexdigest()
    if actual != expected:
        raise AssertionError(f"{name} SHA-256 mismatch: {actual}")
    destination = RUN_DIR / "roms" / system / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    destination.symlink_to(source)


def run_system(system: str) -> str:
    command = [
        str(MAME),
        system,
        "-rompath",
        str(RUN_DIR / "roms"),
        "-cfg_directory",
        str(RUN_DIR / "cfg"),
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
    result = subprocess.run(command, text=True, capture_output=True, timeout=20)
    output = result.stdout + result.stderr
    if result.returncode:
        raise AssertionError(f"{system} exited {result.returncode}")
    expected = f"SAB515TEST system={system} result=00"
    if expected not in output:
        raise AssertionError(f"{system} did not report success")
    if "unmapped sfr memory" in output.lower():
        raise AssertionError(f"{system} accessed an unmapped SFR")
    if system == "sab515wdt" and "SAB80C535 watchdog reset" not in output:
        raise AssertionError("watchdog expiry did not reset the MCU")
    return output


def main() -> None:
    if not MAME.is_file():
        raise AssertionError(f"MAME binary is absent: {MAME}")
    subprocess.run(
        ["python3", str(ROOT / "tests" / "build-conformance-rom.py")],
        check=True,
        timeout=10,
    )
    subprocess.run(
        ["python3", str(ROOT / "tests" / "build-watchdog-rom.py")],
        check=True,
        timeout=10,
    )
    outputs = []
    for system, (name, digest) in ROMS.items():
        prepare_rom(system, name, digest)
        outputs.append(run_system(system))
    log = ROOT / "logs" / "conformance.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text("".join(outputs), encoding="utf-8")
    print("PASS: SFR, IRQ, Timer-2, ADC, capture, and watchdog tests")


if __name__ == "__main__":
    main()
