#!/usr/bin/env python3
"""Prove every required differential corruption fails closed."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CANONICAL_SHA = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"


def load_comparator(path: Path):
    spec = importlib.util.spec_from_file_location("comparison_core", path)
    if spec is None or spec.loader is None:
        raise ImportError(path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.compare_documents


class NegativeGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.root = Path(__file__).resolve().parents[1]
        cls.repository = cls.root.parents[3]
        cls.compare = staticmethod(
            load_comparator(cls.root / "tools/compare-traces.py")
        )
        cls.mame = cls.load("mame-canonical.json")
        cls.ghidra = cls.load("ghidra-canonical.json")
        cls.static = cls.load("static-canonical.json")

    @classmethod
    def load(cls, name: str) -> dict:
        return json.loads((cls.root / "logs" / name).read_text(encoding="utf-8"))

    def pair(self) -> dict[str, dict]:
        return {"mame": copy.deepcopy(self.mame), "static": copy.deepcopy(self.static)}

    def test_corrupted_rom_fails(self) -> None:
        source = self.repository / "ecu/analysis/TotalCombinedROM.bin"
        with tempfile.TemporaryDirectory() as directory:
            corrupt = Path(directory) / "corrupt.bin"
            data = bytearray(source.read_bytes())
            data[0] ^= 0x01
            corrupt.write_bytes(data)
            result = subprocess.run(
                [
                    sys.executable, str(self.root / "tools/static-trace.py"),
                    "--rom", str(corrupt), "--output", str(Path(directory) / "out.json"),
                    "--expected-sha", CANONICAL_SHA, "--profile", "negative",
                    "--count", "1", "--command", "negative-corrupt-rom",
                ],
                check=False, text=True, capture_output=True, timeout=10,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ROM SHA-256", result.stderr)

    def test_altered_pc_fails_cpu_semantics(self) -> None:
        docs = self.pair()
        docs["static"]["events"][5]["pc"] ^= 1
        report = self.compare(docs, CANONICAL_SHA, limit=31)
        self.assertFalse(report["agreement"])
        self.assertEqual(report["first_divergence"]["category"], "cpu_semantics")

    def test_non_monotonic_cycles_fail_validation(self) -> None:
        docs = self.pair()
        docs["static"]["events"][2]["cycles"] = docs["static"]["events"][1]["cycles"]
        with self.assertRaisesRegex(AssertionError, "non-monotonic"):
            self.compare(docs, CANONICAL_SHA, limit=31)

    def test_dropped_access_fails_memory_mapping(self) -> None:
        docs = self.pair()
        self.assertTrue(docs["static"]["events"][1]["accesses"])
        docs["static"]["events"][1]["accesses"] = []
        report = self.compare(docs, CANONICAL_SHA, limit=31)
        self.assertEqual(report["first_divergence"]["category"], "memory_mapping")

    def test_changed_register_fails_cpu_semantics(self) -> None:
        docs = self.pair()
        docs["static"]["events"][0]["registers"]["a"] = 1
        report = self.compare(docs, CANONICAL_SHA, limit=31)
        self.assertEqual(report["first_divergence"]["field"], "registers.a")
        self.assertEqual(report["first_divergence"]["category"], "cpu_semantics")

    def test_fabricated_provenance_fails(self) -> None:
        docs = self.pair()
        docs["mame"]["provenance"]["engine"] = "fabricated-mame"
        with self.assertRaisesRegex(AssertionError, "fabricated engine"):
            self.compare(docs, CANONICAL_SHA, limit=31)

    def test_known_ip_alias_divergence_fails_peripheral_state(self) -> None:
        docs = self.pair()
        docs["static"]["availability"]["registers"].append("ip")
        for event in docs["static"]["events"]:
            event["registers"]["ip"] = 0
        report = self.compare(docs, CANONICAL_SHA, limit=31)
        first = report["first_divergence"]
        self.assertEqual(first["ordinal"], 5)
        self.assertEqual(first["field"], "registers.ip")
        self.assertEqual(first["category"], "peripheral_state")

    def test_unavailable_fields_are_reported(self) -> None:
        docs = {
            "mame": copy.deepcopy(self.mame),
            "ghidra": copy.deepcopy(self.ghidra),
            "static": copy.deepcopy(self.static),
        }
        report = self.compare(docs, CANONICAL_SHA, {"psw": 0xFE})
        self.assertEqual(
            report["first_divergence"]["category"], "unavailable_evidence"
        )
        self.assertGreater(report["unmatched_fields"]["ghidra:cycles"], 0)
        self.assertGreater(report["unmatched_fields"]["ghidra:accesses.sfr"], 0)


if __name__ == "__main__":
    unittest.main()
