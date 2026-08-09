#!/usr/bin/env python3
"""Normalize debugger and driver runtime logs into cycle-ordered NDJSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

PC_LINE = re.compile(r"^CYC=(\d+)\s+([0-9a-f]{4}):", re.IGNORECASE | re.MULTILINE)
INTERRUPT_VECTORS = {
	"0003": "generic-external-0",
	"000b": "generic-timer-0",
	"0013": "generic-external-1",
	"001b": "generic-timer-1",
	"0023": "generic-uart",
	"002b": "generic-timer-2",
	"0043": "sab-adc",
	"0053": "sab-external-3",
}


def parse_pc_events(path: Path, profile: str) -> list[dict[str, Any]]:
	text = path.read_text(encoding="utf-8")
	matches = PC_LINE.findall(text)
	if not matches:
		raise ValueError(f"no cycle-tagged runtime PCs in {path}")
	events: list[dict[str, Any]] = []
	for index, (cycles, pc_text) in enumerate(matches):
		pc = pc_text.lower()
		event = {
			"kind": "pc",
			"profile": profile,
			"cycles": int(cycles),
			"pc": pc,
			"source": "mame-debugger-runtime",
			"source_index": index,
		}
		events.append(event)
		if index > 0 and pc in INTERRUPT_VECTORS:
			events.append(
				{
					"kind": "interrupt",
					"profile": profile,
					"cycles": int(cycles),
					"pc": pc,
					"source": INTERRUPT_VECTORS[pc],
					"source_index": index,
				}
			)
	return events


def parse_driver_events(path: Path, profile: str) -> list[dict[str, Any]]:
	events: list[dict[str, Any]] = []
	for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
		marker = line.find("EVT {")
		if marker < 0:
			continue
		try:
			event = json.loads(line[marker + 4 :])
		except json.JSONDecodeError as error:
			raise ValueError(f"invalid EVT JSON at {path}:{line_number}: {error}") from error
		event["profile"] = profile
		event["source_index"] = line_number
		event.setdefault("cycles", 0)
		event.setdefault("source", "mame-driver-runtime")
		events.append(event)
	if not any(event.get("kind") == "run" and event.get("runtime") is True for event in events):
		raise ValueError(f"missing runtime run event in {path}")
	return events


def require_monotonic(events: list[dict[str, Any]], source_name: str) -> None:
	cycles = [int(event["cycles"]) for event in events if event.get("kind") != "interrupt"]
	if cycles != sorted(cycles):
		raise ValueError(f"{source_name} cycles are non-monotonic")


def normalize_trace(
		trace_path: Path,
		console_path: Path,
		rom_path: Path,
		output_path: Path,
		profile: str,
		mame_commit: str,
		command: str,
) -> None:
	rom_data = rom_path.read_bytes()
	provenance = {
		"kind": "provenance",
		"profile": profile,
		"runtime": True,
		"mame_commit": mame_commit,
		"rom_path": str(rom_path.resolve()),
		"rom_size": len(rom_data),
		"rom_sha256": hashlib.sha256(rom_data).hexdigest(),
		"command": command,
	}
	pc_events = parse_pc_events(trace_path, profile)
	driver_events = parse_driver_events(console_path, profile)
	require_monotonic(pc_events, "debugger trace")
	require_monotonic(driver_events, "driver event log")
	events = pc_events + driver_events
	events.sort(
		key=lambda event: (
			int(event["cycles"]),
			0 if event["kind"] == "pc" else 1,
			int(event["source_index"]),
		)
	)
	output_path.parent.mkdir(parents=True, exist_ok=True)
	with output_path.open("w", encoding="utf-8") as output:
		output.write(json.dumps(provenance, sort_keys=True) + "\n")
		for event in events:
			output.write(json.dumps(event, sort_keys=True) + "\n")


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("--trace", type=Path, required=True)
	parser.add_argument("--console", type=Path, required=True)
	parser.add_argument("--rom", type=Path, required=True)
	parser.add_argument("--output", type=Path, required=True)
	parser.add_argument("--profile", required=True)
	parser.add_argument("--mame-commit", required=True)
	parser.add_argument("--command", required=True)
	args = parser.parse_args()
	normalize_trace(
		args.trace,
		args.console,
		args.rom,
		args.output,
		args.profile,
		args.mame_commit,
		args.command,
	)


if __name__ == "__main__":
	main()
