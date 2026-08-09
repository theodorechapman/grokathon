#!/usr/bin/env python3
"""Parse the small, deterministic Motronic K-line stimulus format."""

from __future__ import annotations


def _number(token: str, base: int, label: str) -> int:
	try:
		return int(token, base)
	except ValueError as error:
		raise ValueError(f"invalid {label}: {token}") from error


def _expand_byte(start_us: int, value: int, bit_us: int, stop: str) -> list[dict[str, int]]:
	bits = [0, *((value >> bit) & 1 for bit in range(8)), int(stop == "good")]
	out = [
		{"time_us": start_us + index * bit_us, "state": state}
		for index, state in enumerate(bits)
	]
	if stop == "bad":
		out.append({"time_us": start_us + 10 * bit_us, "state": 1})
	return out


def parse_stimulus(text: str) -> dict[str, object]:
	"""Parse one fixture and expand byte records into RXD line transitions."""
	bit_us: int | None = None
	events: list[dict[str, object]] = []
	transitions: list[dict[str, int]] = []
	last_start = -1
	for line_number, raw in enumerate(text.splitlines(), start=1):
		line = raw.split("#", 1)[0].strip()
		if not line:
			continue
		fields = line.split()
		if fields[0] == "bit-us":
			if len(fields) != 2 or bit_us is not None or events:
				raise ValueError(f"line {line_number}: misplaced bit-us")
			bit_us = _number(fields[1], 10, "bit period")
			if not 1 <= bit_us <= 100_000:
				raise ValueError(f"line {line_number}: bit period out of range")
			continue
		if bit_us is None:
			raise ValueError(f"line {line_number}: bit-us must be first")
		if fields[0] == "line":
			if len(fields) != 3:
				raise ValueError(f"line {line_number}: line needs time and state")
			start = _number(fields[1], 10, "timestamp")
			state = _number(fields[2], 10, "line state")
			if state not in (0, 1):
				raise ValueError(f"line {line_number}: line state must be 0 or 1")
			event = {"kind": "line", "time_us": start, "state": state}
			expanded = [{"time_us": start, "state": state}]
		elif fields[0] == "byte":
			if len(fields) != 4:
				raise ValueError(f"line {line_number}: byte needs time, value, and stop")
			start = _number(fields[1], 10, "timestamp")
			value = _number(fields[2], 16, "byte")
			stop = fields[3]
			if not 0 <= value <= 0xff:
				raise ValueError(f"line {line_number}: byte out of range")
			if stop not in ("good", "bad"):
				raise ValueError(f"line {line_number}: stop must be good or bad")
			event = {"kind": "byte", "time_us": start, "value": value, "stop": stop}
			expanded = _expand_byte(start, value, bit_us, stop)
		else:
			raise ValueError(f"line {line_number}: unknown record {fields[0]}")
		if start <= last_start:
			raise ValueError(f"line {line_number}: timestamps are not strictly increasing")
		last_start = start
		events.append(event)
		transitions.extend(expanded)
	return {"bit_us": bit_us, "events": events, "transitions": transitions}
