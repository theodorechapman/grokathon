#!/usr/bin/env python3
"""Fail-hard reusable oracle for normalized MAME runtime events."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def require(condition: bool, message: str) -> None:
	if not condition:
		raise AssertionError(message)


def contains_ordered(actual: list[str], expected: list[str]) -> bool:
	position = 0
	for value in expected:
		try:
			position = actual.index(value, position) + 1
		except ValueError:
			return False
	return True


def matches(event: dict[str, Any], requirement: dict[str, Any]) -> bool:
	return all(str(event.get(key, "")).lower() == str(value).lower() for key, value in requirement.items())


def verify_trace(events: list[dict[str, Any]], gate: dict[str, Any]) -> dict[str, int]:
	require(events, "event stream is empty")
	provenance = events[0]
	require(provenance.get("kind") == "provenance", "first event is not provenance")
	require(provenance.get("runtime") is True, "provenance is not runtime-qualified")
	require(provenance.get("profile") == gate["profile"], "runtime profile mismatch")
	require(provenance.get("mame_commit") == gate["mame_commit"], "MAME commit mismatch")
	require(provenance.get("rom_sha256") == gate["rom_sha256"], "ROM mismatch")
	require(provenance.get("rom_size") == gate["rom_size"], "ROM size mismatch")

	runtime_events = events[1:]
	require(
		any(event.get("kind") == "run" and event.get("runtime") is True for event in runtime_events),
		"driver runtime marker is absent",
	)
	pc_events = [
		event
		for event in runtime_events
		if event.get("kind") == "pc" and event.get("source") == "mame-debugger-runtime"
	]
	require(len(pc_events) >= gate.get("minimum_pc_events", 1), "too few runtime PC observations")
	cycles = [int(event["cycles"]) for event in pc_events]
	require(cycles == sorted(cycles), "PC cycles are non-monotonic")
	require(cycles[-1] <= gate["maximum_cycle"], "trace exceeded cycle bound")

	pcs = [str(event["pc"]).lower() for event in pc_events]
	expected_pcs = [str(pc).lower() for pc in gate.get("ordered_pcs", [])]
	if gate.get("pc_order") == "prefix":
		require(pcs[: len(expected_pcs)] == expected_pcs, "PC prefix differs from gate")
	else:
		require(contains_ordered(pcs, expected_pcs), "ordered PC path is absent")
	for requirement in gate.get("require_pc_cycles", []):
		require(
			any(matches(event, requirement) for event in pc_events),
			f"required PC/cycle observation is absent: {requirement}",
		)

	access_events = [
		event
		for event in runtime_events
		if event.get("kind") == "access" and event.get("source") == "mame-driver-runtime"
	]
	for requirement in gate.get("require_accesses", []):
		require(
			any(matches(event, requirement) for event in access_events),
			f"required hardware access is absent: {requirement}",
		)

	interrupt_events = [event for event in runtime_events if event.get("kind") == "interrupt"]
	for requirement in gate.get("require_interrupts", []):
		event_fields = {key: value for key, value in requirement.items() if key != "minimum"}
		count = sum(matches(event, event_fields) for event in interrupt_events)
		require(count >= int(requirement.get("minimum", 1)), f"interrupt evidence is absent: {requirement}")

	input_events = [event for event in runtime_events if event.get("kind") == "input"]
	for requirement in gate.get("require_inputs", []):
		require(
			any(matches(event, requirement) for event in input_events),
			f"input evidence is absent: {requirement}",
		)

	port_events = [
		event
		for event in access_events
		if event.get("space") == "port" and event.get("access") == "write"
	]
	for sequence in gate.get("require_port_sequences", []):
		address = str(sequence["address"]).lower()
		values = [
			str(event["data"]).lower()
			for event in port_events
			if str(event.get("address", "")).lower() == address
		]
		require(
			contains_ordered(values, [str(value).lower() for value in sequence["values"]]),
			f"port transition sequence is absent: {sequence}",
		)

	return {
		"pc_events": len(pc_events),
		"access_events": len(access_events),
		"interrupt_events": len(interrupt_events),
		"input_events": len(input_events),
	}


def load_ndjson(path: Path) -> list[dict[str, Any]]:
	events: list[dict[str, Any]] = []
	for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
		try:
			events.append(json.loads(line))
		except json.JSONDecodeError as error:
			raise ValueError(f"invalid NDJSON at {path}:{line_number}: {error}") from error
	return events


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("--events", type=Path, required=True)
	parser.add_argument("--gate", type=Path, required=True)
	parser.add_argument("--report", type=Path)
	args = parser.parse_args()
	events = load_ndjson(args.events)
	gate = json.loads(args.gate.read_text(encoding="utf-8"))
	counts = verify_trace(events, gate)
	report = {"passed": True, "profile": gate["profile"], **counts}
	if args.report:
		args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
	print("PASS " + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
	main()
