#!/usr/bin/env python3
"""Run all pure workstream gates without requiring a MAME checkout."""

import subprocess
import sys
from pathlib import Path


def verify() -> None:
    root = Path(__file__).resolve().parent
    tests = (
        "test-generator.py",
        "test-capture-oracle.py",
        "test-negative-gates.py",
    )
    for test in tests:
        result = subprocess.run(
            [sys.executable, str(root / "tests" / test)],
            cwd=root,
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )
        if result.returncode:
            raise AssertionError(
                f"{test} failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )
        print(result.stdout.strip())
    print("PASS: deterministic crank stimulus workstream")


if __name__ == "__main__":
    verify()
