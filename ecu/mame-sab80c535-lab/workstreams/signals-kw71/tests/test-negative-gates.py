#!/usr/bin/env python3
"""Tests proving malformed and overclaimed fixtures fail closed."""

from __future__ import annotations

import copy
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


_GATE = _load("manifest-gate.py")
_ORACLE = _load("stimulus-oracle.py")
_PARSER = _load("stimulus-format.py")
_MANIFEST = json.loads((_ROOT / "fixtures/scenarios.json").read_text())


class NegativeGateTests(unittest.TestCase):
	def test_manifest_passes_unchanged(self) -> None:
		_GATE.verify_manifest(_MANIFEST)

	def test_rejects_non_monotonic_timestamps(self) -> None:
		text = "bit-us 104\nbyte 2000 06 good\nbyte 1000 7e good\n"
		with self.assertRaisesRegex(ValueError, "strictly increasing"):
			_PARSER.parse_stimulus(text)

	def test_rejects_overlapping_uart_characters(self) -> None:
		text = "bit-us 104\nbyte 1000 06 good\nbyte 1500 7e good\n"
		with self.assertRaisesRegex(AssertionError, "overlap"):
			_ORACLE.verify_stimulus(text)

	def test_rejects_bad_stop_spelling(self) -> None:
		with self.assertRaisesRegex(ValueError, "stop must"):
			_PARSER.parse_stimulus("bit-us 104\nbyte 1000 06 guessed\n")

	def test_rejects_line_left_dominant(self) -> None:
		with self.assertRaisesRegex(AssertionError, "dominant"):
			_ORACLE.verify_stimulus("bit-us 104\nline 1000 0\n")

	def test_rejects_unproven_programming_request(self) -> None:
		mutated = copy.deepcopy(_MANIFEST)
		mutated["request_services"]["programming"] = "02"
		with self.assertRaisesRegex(AssertionError, "unsupported"):
			_GATE.verify_manifest(mutated)

	def test_rejects_additive_checksum_claim(self) -> None:
		mutated = copy.deepcopy(_MANIFEST)
		mutated["scenarios"]["malformed-checksum"]["meaning"] = "bad CRC"
		with self.assertRaisesRegex(AssertionError, "checksum evidence"):
			_GATE.verify_manifest(mutated)

	def test_rejects_weakened_bad_complement(self) -> None:
		mutated = copy.deepcopy(_MANIFEST)
		mutated["scenarios"]["malformed-checksum"]["injected"] = "f2"
		with self.assertRaisesRegex(AssertionError, "weakened"):
			_GATE.verify_manifest(mutated)


if __name__ == "__main__":
	unittest.main()
