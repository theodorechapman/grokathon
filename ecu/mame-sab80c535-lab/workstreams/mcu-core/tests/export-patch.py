#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

import argparse
import difflib
import subprocess
from pathlib import Path

PATCH_PATHS = (
    "scripts/src/cpu.lua",
    "src/devices/cpu/mcs51/i8051.cpp",
    "src/devices/cpu/mcs51/i8051.h",
    "src/devices/cpu/mcs51/sab80c535.cpp",
    "src/devices/cpu/mcs51/sab80c535.h",
    "src/devices/cpu/mcs51/sab80c535_irq.cpp",
    "src/devices/cpu/mcs51/sab80c535_peripherals.cpp",
    "src/mame/mame.lst",
    "src/mame/skeleton/motronic175.cpp",
    "src/mame/skeleton/sab80c515test.cpp",
)


def parse_args() -> argparse.Namespace:
    workstream = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--modified", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=workstream / "mame-sab80c515.patch")
    return parser.parse_args()


def baseline_text(checkout: Path, path: str) -> str | None:
    result = subprocess.run(
        ["git", "-C", str(checkout), "show", f"HEAD:{path}"],
        text=True,
        capture_output=True,
        check=False,
    )
    return result.stdout if result.returncode == 0 else None


def make_diff(path: str, old: str | None, new: str | None) -> str:
    old_lines = [] if old is None else old.splitlines(keepends=True)
    new_lines = [] if new is None else new.splitlines(keepends=True)
    header = [f"diff --git a/{path} b/{path}\n"]
    if old is None:
        header.append("new file mode 100644\n")
    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile="/dev/null" if old is None else f"a/{path}",
        tofile="/dev/null" if new is None else f"b/{path}",
        n=3,
    )
    return "".join(header + list(diff))


def main() -> None:
    args = parse_args()
    parts: list[str] = []
    for path in PATCH_PATHS:
        old = baseline_text(args.baseline, path)
        modified_path = args.modified / path
        new = modified_path.read_text(encoding="utf-8") if modified_path.is_file() else None
        if old != new:
            parts.append(make_diff(path, old, new))
    args.output.write_text("".join(parts), encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
