#!/usr/bin/env python3
"""Thin MAME process and log parsing edge for XDATA experiments."""

import hashlib
import os
import re
import subprocess
from pathlib import Path

ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
FIELDS = re.compile(r"(\w+)=([^\s]+)")
UNKNOWN = re.compile(
    r"UNKNOWN read addr=([0-9a-f]{4}) pc=([0-9a-f]{4}) value=([0-9a-f]{2})",
    re.IGNORECASE,
)
TAINT = re.compile(
    r"TAINT outcome read_pc=([0-9a-f]{4}) addr=([0-9a-f]{4}) "
    r"value=([0-9a-f]{2}) branch_pc=([0-9a-f]{4}) next_pc=([0-9a-f]{4})",
    re.IGNORECASE,
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summary_fields(text: str, prefix: str) -> dict[str, str]:
    lines = [line for line in text.splitlines() if prefix in line]
    if len(lines) != 1:
        raise AssertionError(f"expected one {prefix}, found {len(lines)}")
    return dict(FIELDS.findall(lines[0]))


def parse_output(text: str) -> dict:
    unknowns = [
        {"address": address.lower(), "pc": pc.lower(), "value": value.lower()}
        for address, pc, value in UNKNOWN.findall(text)
    ]
    taint = [
        {
            "read_pc": read_pc.lower(),
            "address": address.lower(),
            "value": value.lower(),
            "branch_pc": branch_pc.lower(),
            "next_pc": next_pc.lower(),
        }
        for read_pc, address, value, branch_pc, next_pc in TAINT.findall(text)
    ]
    return {
        "execution": summary_fields(text, "ESUMMARY"),
        "xdata": summary_fields(text, "XSUMMARY"),
        "unknown_reads": unknowns,
        "taint_outcomes": taint,
        "soft_reset": "Soft reset" in text,
    }


class Runner:
    def __init__(self, mame: Path, rom: Path, run_dir: Path):
        self.mame = mame
        self.run_dir = run_dir
        rom_dir = run_dir / "roms" / "motronic175"
        rom_dir.mkdir(parents=True, exist_ok=True)
        destination = rom_dir / "totalcombinedrom.bin"
        destination.unlink(missing_ok=True)
        destination.symlink_to(rom)
        (run_dir / "cfg").mkdir(parents=True, exist_ok=True)

    def run(self, settings: dict[str, str]) -> tuple[dict, str]:
        environment = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith("MOTRONIC_")
        }
        environment.update(settings)
        command = [
            str(self.mame),
            "motronic175",
            "-rompath",
            str(self.run_dir / "roms"),
            "-cfg_directory",
            str(self.run_dir / "cfg"),
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
            cwd=self.run_dir,
            env=environment,
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )
        output = result.stdout + result.stderr
        if result.returncode:
            raise AssertionError(
                f"MAME exited {result.returncode}: {output[-1000:]}"
            )
        return parse_output(output), output


def artifact(path: Path) -> dict:
    return {"path": path.name, "bytes": path.stat().st_size, "sha256": digest(path)}


def signature(result: dict) -> tuple:
    execution = result["execution"]
    taint = tuple(
        (item["read_pc"], item["branch_pc"], item["next_pc"])
        for item in result["taint_outcomes"]
    )
    unknown_path = tuple(
        (item["address"], item["pc"]) for item in result["unknown_reads"]
    )
    return (
        execution["reason"],
        execution["startup_frontier"],
        execution["init_entries"],
        execution["foreground_entries"],
        execution["pc_hash"],
        unknown_path,
        taint,
    )
