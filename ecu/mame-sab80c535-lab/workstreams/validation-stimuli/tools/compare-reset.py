#!/usr/bin/env python3
"""Differentially compare runtime MAME reset PCs with Ghidra trace artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def normalize_pc(value: str) -> str:
	return value.lower().removeprefix("code:")


def compare_reset(
		events: list[dict[str, Any]],
		validation: dict[str, Any],
		emulator_traces: dict[str, Any],
) -> dict[str, Any]:
	if not events or events[0].get("kind") != "provenance" or events[0].get("runtime") is not True:
		raise AssertionError("MAME event stream lacks runtime provenance")
	mame_pcs = [
		normalize_pc(str(event["pc"]))
		for event in events
		if event.get("kind") == "pc" and event.get("source") == "mame-debugger-runtime"
	]
	reset_validation = validation.get("reset", {})
	if reset_validation.get("passed") is not True:
		raise AssertionError("existing reset validation is not passing")
	expected = [normalize_pc(pc) for pc in reset_validation.get("expected", [])]
	actual = [normalize_pc(pc) for pc in reset_validation.get("actual", [])]
	ghidra_trace = [
		normalize_pc(str(step["pc"]))
		for step in emulator_traces.get("reset_trace", [])
	]
	if not expected or expected != actual:
		raise AssertionError("Ghidra validation expected/actual reset paths differ")
	if expected != ghidra_trace:
		raise AssertionError("Ghidra reset artifacts disagree with each other")
	if mame_pcs[: len(expected)] != expected:
		raise AssertionError(
			f"MAME reset prefix {mame_pcs[:len(expected)]} differs from Ghidra {expected}"
		)
	return {
		"passed": True,
		"runtime_source": "mame-debugger-runtime",
		"matched_pc_count": len(expected),
		"path": expected,
	}


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("--events", type=Path, required=True)
	parser.add_argument("--validation-summary", type=Path, required=True)
	parser.add_argument("--emulator-traces", type=Path, required=True)
	parser.add_argument("--report", type=Path)
	args = parser.parse_args()
	events = [
		json.loads(line)
		for line in args.events.read_text(encoding="utf-8").splitlines()
	]
	validation = json.loads(args.validation_summary.read_text(encoding="utf-8"))
	traces = json.loads(args.emulator_traces.read_text(encoding="utf-8"))
	report = compare_reset(events, validation, traces)
	if args.report:
		args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
	print("PASS " + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
	main()
