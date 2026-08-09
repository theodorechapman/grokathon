#!/usr/bin/env python3
"""Run bounded canonical and surrogate MAME validations."""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from pathlib import Path

MAME_COMMIT = "a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
CANONICAL_SIZE = "0xa000"
CANONICAL_SHA = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
STIMULUS_SIZE = "0x1000"
STIMULUS_SHA = "c9cf8a0250f311bb221451bbd9fed879a451c58838d08d0d004cd343c296e389"


def run_checked(command: list[str], timeout: int, cwd: Path) -> str:
	result = subprocess.run(
		command,
		cwd=cwd,
		check=False,
		text=True,
		stdout=subprocess.PIPE,
		stderr=subprocess.STDOUT,
		timeout=timeout,
	)
	if result.returncode != 0:
		raise RuntimeError(
			f"command failed ({result.returncode}): {shlex.join(command)}\n{result.stdout}"
		)
	return result.stdout


def replace_symlink(source: Path, destination: Path) -> None:
	destination.parent.mkdir(parents=True, exist_ok=True)
	if destination.exists() or destination.is_symlink():
		destination.unlink()
	destination.symlink_to(source.resolve())


def verify_identity(workstream: Path, rom: Path, size: str, sha256: str) -> str:
	return run_checked(
		[
			sys.executable,
			str(workstream / "tools/verify-rom.py"),
			str(rom),
			"--size",
			size,
			"--sha256",
			sha256,
		],
		10,
		workstream,
	)


def run_profile(
		workstream: Path,
		mame_binary: Path,
		run_root: Path,
		system: str,
		profile: str,
		rom: Path,
		debug_script: str,
		gate: str,
) -> str:
	logs = workstream / "logs"
	trace = logs / ("reset.trace" if profile == "canonical-reset" else "stimulus.trace")
	console = logs / (
		"reset-console.log" if profile == "canonical-reset" else "stimulus-console.log"
	)
	events = logs / (
		"reset-events.ndjson" if profile == "canonical-reset" else "stimulus-events.ndjson"
	)
	report = logs / (
		"reset-oracle.json" if profile == "canonical-reset" else "stimulus-oracle.json"
	)
	for path in (trace, console, events, report):
		path.unlink(missing_ok=True)

	rom_name = "totalcombinedrom.bin" if system == "motronicvalid" else "stimulus.bin"
	replace_symlink(rom, run_root / "roms" / system / rom_name)
	(run_root / "cfg").mkdir(parents=True, exist_ok=True)
	command = [
		str(mame_binary),
		system,
		"-rompath",
		str(run_root / "roms"),
		"-cfg_directory",
		str(run_root / "cfg"),
		"-debug",
		"-debugger",
		os.environ.get("MAME_DEBUGGER", "osx"),
		"-debugscript",
		str(workstream / "fixtures" / debug_script),
		"-sound",
		"none",
		"-nothrottle",
		"-nosleep",
		"-nowriteconfig",
		"-skip_gameinfo",
		"-oslog",
	]
	console.write_text(run_checked(command, 60, workstream), encoding="utf-8")
	command_text = shlex.join(command)
	run_checked(
		[
			sys.executable,
			str(workstream / "tools/trace-normalizer.py"),
			"--trace",
			str(trace),
			"--console",
			str(console),
			"--rom",
			str(rom),
			"--output",
			str(events),
			"--profile",
			profile,
			"--mame-commit",
			MAME_COMMIT,
			"--command",
			command_text,
		],
		10,
		workstream,
	)
	return run_checked(
		[
			sys.executable,
			str(workstream / "tools/trace-oracle.py"),
			"--events",
			str(events),
			"--gate",
			str(workstream / "fixtures" / gate),
			"--report",
			str(report),
		],
		10,
		workstream,
	)


def main() -> None:
	workstream = Path(__file__).resolve().parents[1]
	repository = workstream.parents[3]
	parser = argparse.ArgumentParser()
	parser.add_argument("--mame-dir", type=Path, default=Path("/tmp/mame-motronic-validation"))
	parser.add_argument("--run-root", type=Path, default=Path("/tmp/mame-motronic-validation-run"))
	parser.add_argument("--profile", choices=("all", "reset", "stimulus"), default="all")
	args = parser.parse_args()

	head = run_checked(["git", "-C", str(args.mame_dir), "rev-parse", "HEAD"], 10, workstream).strip()
	if head != MAME_COMMIT:
		raise AssertionError(f"MAME checkout {head} != pinned {MAME_COMMIT}")
	mame_binary = args.mame_dir / "motronicvalid"
	if not mame_binary.is_file() or not os.access(mame_binary, os.X_OK):
		raise AssertionError(f"built MAME target is absent: {mame_binary}")

	canonical_rom = repository / "ecu/analysis/TotalCombinedROM.bin"
	stimulus_rom = workstream / "fixtures/stimulus.bin"
	results: list[str] = []
	if args.profile in ("all", "reset"):
		results.append(verify_identity(workstream, canonical_rom, CANONICAL_SIZE, CANONICAL_SHA))
		results.append(
			run_profile(
				workstream,
				mame_binary,
				args.run_root,
				"motronicvalid",
				"canonical-reset",
				canonical_rom,
				"trace-reset.cmd",
				"canonical-reset-gate.json",
			)
		)
		results.append(
			run_checked(
				[
					sys.executable,
					str(workstream / "tools/compare-reset.py"),
					"--events",
					str(workstream / "logs/reset-events.ndjson"),
					"--validation-summary",
					str(repository / "ecu/e2e-analysis/traces/validation-summary.json"),
					"--emulator-traces",
					str(repository / "ecu/e2e-analysis/traces/emulator-traces.json"),
					"--report",
					str(workstream / "logs/reset-differential.json"),
				],
				10,
				workstream,
			)
		)
	if args.profile in ("all", "stimulus"):
		results.append(verify_identity(workstream, stimulus_rom, STIMULUS_SIZE, STIMULUS_SHA))
		results.append(
			run_profile(
				workstream,
				mame_binary,
				args.run_root,
				"motronicstim",
				"surrogate-stimulus",
				stimulus_rom,
				"trace-stimulus.cmd",
				"surrogate-stimulus-gate.json",
			)
		)
	print("".join(results), end="")


if __name__ == "__main__":
	main()
