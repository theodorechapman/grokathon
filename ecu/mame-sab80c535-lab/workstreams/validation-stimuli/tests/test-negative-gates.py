#!/usr/bin/env python3
"""Negative oracle tests; synthetic data is never accepted as runtime proof."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import ModuleType

WORKSTREAM = Path(__file__).resolve().parents[1]


def load_tool(filename: str) -> ModuleType:
	path = WORKSTREAM / "tools" / filename
	spec = importlib.util.spec_from_file_location(filename.removesuffix(".py"), path)
	if spec is None or spec.loader is None:
		raise RuntimeError(f"cannot load {path}")
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


ORACLE = load_tool("trace-oracle.py")
ROM = load_tool("verify-rom.py")


def rejection_fixture() -> tuple[list[dict[str, object]], dict[str, object]]:
	events: list[dict[str, object]] = [
		{
			"kind": "provenance",
			"runtime": True,
			"profile": "negative-unit-fixture",
			"mame_commit": "pinned",
			"rom_sha256": "correct",
			"rom_size": 2,
		},
		{"kind": "run", "runtime": True, "cycles": 0},
		{"kind": "pc", "source": "mame-debugger-runtime", "cycles": 0, "pc": "0000"},
		{"kind": "pc", "source": "mame-debugger-runtime", "cycles": 2, "pc": "0003"},
		{
			"kind": "access",
			"source": "mame-driver-runtime",
			"space": "sfr",
			"access": "read",
			"address": "00a9",
			"data": "ff",
		},
	]
	gate: dict[str, object] = {
		"profile": "negative-unit-fixture",
		"mame_commit": "pinned",
		"rom_sha256": "correct",
		"rom_size": 2,
		"minimum_pc_events": 2,
		"maximum_cycle": 4,
		"pc_order": "prefix",
		"ordered_pcs": ["0000", "0003"],
		"require_pc_cycles": [{"pc": "0003", "cycles": 2}],
		"require_accesses": [{"space": "sfr", "access": "read", "address": "00a9"}],
	}
	return events, gate


class NegativeGateTests(unittest.TestCase):
	def test_rejects_wrong_pc_order(self) -> None:
		events, gate = rejection_fixture()
		events[2]["pc"], events[3]["pc"] = events[3]["pc"], events[2]["pc"]
		with self.assertRaisesRegex(AssertionError, "PC prefix"):
			ORACLE.verify_trace(events, gate)

	def test_rejects_non_monotonic_cycles(self) -> None:
		events, gate = rejection_fixture()
		events[2]["cycles"] = 3
		events[3]["cycles"] = 2
		with self.assertRaisesRegex(AssertionError, "non-monotonic"):
			ORACLE.verify_trace(events, gate)

	def test_rejects_absent_hardware_evidence(self) -> None:
		events, gate = rejection_fixture()
		events.pop()
		with self.assertRaisesRegex(AssertionError, "hardware access"):
			ORACLE.verify_trace(events, gate)

	def test_rejects_wrong_pc_cycle(self) -> None:
		events, gate = rejection_fixture()
		gate["require_pc_cycles"] = [{"pc": "0003", "cycles": 3}]
		with self.assertRaisesRegex(AssertionError, "PC/cycle"):
			ORACLE.verify_trace(events, gate)

	def test_rejects_rom_mismatch(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			path = Path(directory) / "wrong.bin"
			path.write_bytes(b"\x00\x01")
			with self.assertRaisesRegex(AssertionError, "SHA-256"):
				ROM.verify_rom(path, 2, "0" * 64)


if __name__ == "__main__":
	unittest.main()
