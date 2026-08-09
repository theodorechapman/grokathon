#!/usr/bin/env python3
"""Positive parser, framing, fixture, and snapshot tests."""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from types import ModuleType

_ROOT = Path(__file__).resolve().parents[1]


def _load(filename: str) -> ModuleType:
	path = _ROOT / "tools" / filename
	spec = importlib.util.spec_from_file_location(filename.removesuffix(".py"), path)
	if spec is None or spec.loader is None:
		raise RuntimeError(f"cannot load {path}")
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


_BUILDER = _load("kw71-fixtures.py")
_ORACLE = _load("stimulus-oracle.py")
_PARSER = _load("stimulus-format.py")


class StimulusTests(unittest.TestCase):
	def test_generated_fixtures_match_snapshots(self) -> None:
		for name, expected in _BUILDER.build_kw71_fixtures().items():
			actual = (_ROOT / "fixtures" / name).read_text(encoding="utf-8")
			self.assertEqual(actual, expected, name)

	def test_every_stimulus_passes_oracle(self) -> None:
		for path in sorted((_ROOT / "fixtures").glob("*.stim")):
			summary = _ORACLE.verify_stimulus(path.read_text(encoding="utf-8"))
			self.assertGreater(summary["events"], 0, path.name)

	def test_manifest_covers_all_required_scenarios(self) -> None:
		manifest = json.loads((_ROOT / "fixtures/scenarios.json").read_text())
		self.assertEqual(
			set(manifest["scenarios"]),
			{
				"actuator-test",
				"disconnect",
				"framing-error",
				"identifier-transfer",
				"malformed-checksum",
				"no-tester",
				"read-memory-sfr",
				"timeout",
				"valid-session-start",
			},
		)

	def test_uart_bytes_expand_lsb_first(self) -> None:
		parsed = _PARSER.parse_stimulus("bit-us 10\nbyte 100 81 good\n")
		states = [entry["state"] for entry in parsed["transitions"]]
		self.assertEqual(states, [0, 1, 0, 0, 0, 0, 0, 0, 1, 1])

	def test_framing_error_holds_stop_low_then_releases(self) -> None:
		text = (_ROOT / "fixtures/framing-error.stim").read_text()
		parsed = _PARSER.parse_stimulus(text)
		states = [entry["state"] for entry in parsed["transitions"]]
		self.assertEqual(states[-2:], [0, 1])
		self.assertEqual(_ORACLE.verify_stimulus(text)["framing_errors"], 1)

	def test_supported_request_frames_are_exact(self) -> None:
		manifest = json.loads((_ROOT / "fixtures/scenarios.json").read_text())
		self.assertEqual(
			manifest["scenarios"]["read-memory-sfr"]["request"],
			["06", "0c", "01", "01", "01", "90", "03"],
		)
		self.assertEqual(
			manifest["scenarios"]["actuator-test"]["request"],
			["04", "0c", "04", "03", "03"],
		)

	def test_identifier_payload_matches_rom_order(self) -> None:
		text = (_ROOT / "fixtures/identifier-transfer.stim").read_text()
		values = [
			event["value"]
			for event in _PARSER.parse_stimulus(text)["events"]
			if event["kind"] == "byte"
		]
		self.assertEqual(values[2:6], [0xf2, 0xfe, 0x09, 0xca])
		self.assertEqual(values[-4:], [0xfc, 0xf4, 0xf6, 0xfc])


if __name__ == "__main__":
	unittest.main()
