#!/usr/bin/env python3
"""Pure checks for the generated 8051 capture conformance oracle."""

import hashlib
import importlib.util
import sys
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_SHA256 = "17c103883c18331b799ec25f560f7bb0a780878093dfd4d139eb845a1cfd8dd0"


def _load_builder() -> object:
    path = ROOT / "tests" / "build-capture-rom.py"
    spec = importlib.util.spec_from_file_location("capture_rom_builder", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CaptureOracleTests(unittest.TestCase):
    def test_rom_is_reproducible_and_pinned(self) -> None:
        builder = _load_builder()
        generated = builder.build_capture_rom()
        artifact = (ROOT / "artifacts" / "sab80c515-capture-test.bin").read_bytes()
        self.assertEqual(generated, artifact)
        self.assertEqual(hashlib.sha256(generated).hexdigest(), EXPECTED_SHA256)
        self.assertEqual(f"{zlib.crc32(generated):08x}", "dcfd8ed7")

    def test_rom_vectors_and_checks_capture_delta(self) -> None:
        rom = _load_builder().build_capture_rom()
        self.assertEqual(rom[0], 0x02)
        self.assertEqual(rom[0x53], 0x02)
        self.assertIn(bytes((0xB4, 121)), rom)
        self.assertIn(bytes((0x20, 0xC2)), rom)

    def test_driver_stimulus_has_two_falling_edges(self) -> None:
        source = (
            ROOT / "source" / "sab80c515-capture-test.cpp"
        ).read_text(encoding="utf-8")
        for event in (
            "{ 40, ASSERT_LINE }",
            "{ 200, CLEAR_LINE }",
            "{ 204, ASSERT_LINE }",
            "{ 321, CLEAR_LINE }",
        ):
            self.assertIn(event, source)
        self.assertEqual(321 - 200, 121)


if __name__ == "__main__":
    unittest.main()
