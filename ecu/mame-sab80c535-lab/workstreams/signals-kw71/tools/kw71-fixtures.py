#!/usr/bin/env python3
"""Build evidence-bounded KW71 tester-to-ECU fixture text."""

from __future__ import annotations

import json

_BIT_US = 104
_SLOT_US = 4_000
_TERMINATOR = 0x03
_IDENTITY_SERVICE = 0xF6
_CONTINUE_SERVICE = 0x09
_IDENTITY_PAYLOADS = (
	(0x35, 0x37, 0x31, 0x30, 0x30, 0x32, 0x31, 0x36, 0x32, 0x30),
	(0x38, 0x37, 0x33, 0x36, 0x35, 0x33, 0x37, 0x36, 0x32, 0x31),
	(0x31, 0x33, 0x31, 0x34, 0x33, 0x37, 0x31),
	(0x31, 0x30, 0x30),
	(0x30, 0x37, 0x32),
)


class _Timeline:
	def __init__(self) -> None:
		self.time_us = 20_000
		self.lines = [f"bit-us {_BIT_US}"]

	def byte(self, value: int, stop: str = "good", note: str = "") -> None:
		suffix = f" # {note}" if note else ""
		self.lines.append(f"byte {self.time_us} {value:02x} {stop}{suffix}")
		self.time_us += _SLOT_US

	def line(self, state: int, note: str = "") -> None:
		suffix = f" # {note}" if note else ""
		self.lines.append(f"line {self.time_us} {state}{suffix}")
		self.time_us += _SLOT_US

	def text(self) -> str:
		return "\n".join(self.lines) + "\n"


def _frame(sequence: int, service: int, payload: tuple[int, ...] = ()) -> tuple[int, ...]:
	return (len(payload) + 3, sequence, service, *payload, _TERMINATOR)


def _echo(timeline: _Timeline, ecu_frame: tuple[int, ...], note: str) -> None:
	for index, value in enumerate(ecu_frame):
		timeline.byte(value ^ 0xff, note=f"{note} echo {index}")


def _handshake(timeline: _Timeline) -> None:
	timeline.byte(0x06, note="startup byte proven at CODE:774f")
	timeline.byte(0x7e, note="complement of ECU keyword 0x81")


def _ready_session() -> _Timeline:
	timeline = _Timeline()
	_handshake(timeline)
	for index, payload in enumerate(_IDENTITY_PAYLOADS):
		ecu_sequence = index * 2 + 1
		_echo(
			timeline,
			_frame(ecu_sequence, _IDENTITY_SERVICE, payload),
			f"identifier block {index}",
		)
		for value in _frame(ecu_sequence + 1, _CONTINUE_SERVICE):
			timeline.byte(value, note=f"continue block {index}")
	_echo(timeline, _frame(0x0b, _CONTINUE_SERVICE), "ready acknowledgement")
	return timeline


def _manifest() -> dict[str, object]:
	return {
		"schema": "motronic-kw71-stimuli/v1",
		"bit_period_us": _BIT_US,
		"timing_class": "protocol-family assumption",
		"request_services": {
			"read-memory-sfr": "01",
			"actuator-test": "04",
			"disconnect": "06",
			"identifier-continue": "09",
		},
		"response_services": {"read-memory": "fe", "identifier": "f6"},
		"scenarios": {
			"no-tester": {"outcome": "idle high; no received byte"},
			"valid-session-start": {"rx_bytes": ["06", "7e"]},
			"identifier-transfer": {"last_sequence": "0b"},
			"read-memory-sfr": {"request": ["06", "0c", "01", "01", "01", "90", "03"]},
			"actuator-test": {"request": ["04", "0c", "04", "03", "03"]},
			"malformed-checksum": {
				"meaning": "bad complement; firmware has no additive checksum field",
				"expected": "f2",
				"injected": "f3",
			},
			"timeout": {"meaning": "length received, body withheld"},
			"framing-error": {"meaning": "0x06 with low stop bit"},
			"disconnect": {"request": ["03", "0c", "06", "03"]},
		},
	}


def build_kw71_fixtures() -> dict[str, str]:
	"""Return every generated fixture and its machine-readable manifest."""
	files: dict[str, str] = {}
	no_tester = _Timeline()
	no_tester.time_us = 0
	no_tester.line(1, "recessive/idle RXD")
	files["no-tester.stim"] = no_tester.text()

	start = _Timeline()
	_handshake(start)
	files["valid-session-start.stim"] = start.text()
	files["identifier-transfer.stim"] = _ready_session().text()

	read_memory = _ready_session()
	for value in _frame(0x0c, 0x01, (0x01, 0x01, 0x90)):
		read_memory.byte(value, note="read one supported SFR byte at P1/0x90")
	files["read-memory-sfr.stim"] = read_memory.text()

	actuator = _ready_session()
	for value in _frame(0x0c, 0x04, (0x03,)):
		actuator.byte(value, note="actuator request 0x03")
	files["actuator-test.stim"] = actuator.text()

	bad_complement = _Timeline()
	_handshake(bad_complement)
	bad_complement.byte(0xf3, note="wrong complement for ECU length 0x0d; expected 0xf2")
	files["malformed-checksum.stim"] = bad_complement.text()

	timeout = _ready_session()
	timeout.byte(0x06, note="request length only; no sequence/body follows")
	files["timeout.stim"] = timeout.text()

	framing = _Timeline()
	framing.byte(0x06, stop="bad", note="low stop bit")
	files["framing-error.stim"] = framing.text()

	disconnect = _ready_session()
	for value in _frame(0x0c, 0x06):
		disconnect.byte(value, note="firmware command 0x06")
	disconnect.line(1, note="tester released K-line")
	files["disconnect.stim"] = disconnect.text()
	files["scenarios.json"] = json.dumps(_manifest(), indent=2, sort_keys=True) + "\n"
	return files
