#!/usr/bin/env python3
"""Fail-closed structural oracle for KW71 stimulus fixtures."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType


def _load_parser() -> ModuleType:
	path = Path(__file__).with_name("stimulus-format.py")
	spec = importlib.util.spec_from_file_location("stimulus_format", path)
	if spec is None or spec.loader is None:
		raise RuntimeError(f"cannot load {path}")
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


def verify_stimulus(text: str) -> dict[str, int]:
	"""Verify framing, timing separation, and idle release for one fixture."""
	parsed = _load_parser().parse_stimulus(text)
	bit_us = parsed["bit_us"]
	if not isinstance(bit_us, int):
		raise AssertionError("fixture has no bit period")
	events = parsed["events"]
	if not isinstance(events, list) or not events:
		raise AssertionError("fixture has no events")
	last_end = -1
	bytes_seen = 0
	framing_errors = 0
	for event in events:
		start = event["time_us"]
		if not isinstance(start, int):
			raise AssertionError("event timestamp is not an integer")
		if start < last_end:
			raise AssertionError("events overlap a UART character")
		if event["kind"] == "byte":
			bytes_seen += 1
			framing_errors += int(event["stop"] == "bad")
			last_end = start + 10 * bit_us
		else:
			last_end = start
	transitions = parsed["transitions"]
	if not isinstance(transitions, list) or not transitions:
		raise AssertionError("fixture produced no line transitions")
	for previous, current in zip(transitions, transitions[1:]):
		if current["time_us"] < previous["time_us"]:
			raise AssertionError("expanded transitions are non-monotonic")
	if transitions[-1]["state"] != 1:
		raise AssertionError("fixture leaves RXD dominant")
	return {
		"events": len(events),
		"bytes": bytes_seen,
		"framing_errors": framing_errors,
		"duration_us": transitions[-1]["time_us"],
	}
