"""Regression tests for Game Boy ROM blinding."""

from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from staticre.blind import prepare_binary


TITLE_START = 0x134
HEADER_CHECKSUM = 0x14D
GLOBAL_CHECKSUM = 0x14E


def fix_checksums(data: bytearray) -> None:
    checksum = 0
    for index in range(TITLE_START, HEADER_CHECKSUM):
        checksum = (checksum - data[index] - 1) & 0xFF
    data[HEADER_CHECKSUM] = checksum

    data[GLOBAL_CHECKSUM : GLOBAL_CHECKSUM + 2] = b"\x00\x00"
    total = sum(data) & 0xFFFF
    data[GLOBAL_CHECKSUM] = total >> 8
    data[GLOBAL_CHECKSUM + 1] = total & 0xFF


def assert_valid_checksums(test: unittest.TestCase, data: bytes) -> None:
    checksum = 0
    for index in range(TITLE_START, HEADER_CHECKSUM):
        checksum = (checksum - data[index] - 1) & 0xFF
    test.assertEqual(data[HEADER_CHECKSUM], checksum)

    expected_global = (
        sum(data) - data[GLOBAL_CHECKSUM] - data[GLOBAL_CHECKSUM + 1]
    ) & 0xFFFF
    stored_global = (data[GLOBAL_CHECKSUM] << 8) | data[GLOBAL_CHECKSUM + 1]
    test.assertEqual(stored_global, expected_global)


class PrepareBinaryTests(unittest.TestCase):
    def prepare(self, rom: bytearray) -> tuple[dict, bytes]:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "revealing-name.gbc"
            output = Path(temp_dir) / "output"
            source.write_bytes(rom)
            result = prepare_binary(source, output)
            return result, Path(result["path"]).read_bytes()

    def test_cgb_blinding_preserves_manufacturer_flag_and_other_fields(self) -> None:
        rom = bytearray((index * 17 + 3) & 0xFF for index in range(0x8000))
        rom[0x134:0x13F] = b"HELLO WORLD"
        rom[0x13F:0x143] = b"ABCD"
        rom[0x143] = 0xC0
        rom[0x144:0x14D] = bytes(
            [0x30, 0x31, 0x03, 0x1B, 0x00, 0x03, 0x01, 0x33, 0x07]
        )
        fix_checksums(rom)
        original = bytes(rom)

        result, blinded = self.prepare(rom)

        self.assertEqual(blinded[0x134:0x13F], bytes(11))
        self.assertEqual(blinded[0x13F:0x14D], original[0x13F:0x14D])
        changed = set(range(0x134, 0x13F)) | {0x14D, 0x14E, 0x14F}
        for index, (before, after) in enumerate(zip(original, blinded)):
            if index not in changed:
                self.assertEqual(after, before, f"unexpected change at {index:#x}")
        self.assertEqual(result["sha256_original"], hashlib.sha256(original).hexdigest())
        self.assertEqual(result["sha256"], hashlib.sha256(blinded).hexdigest())
        self.assertEqual(Path(result["path"]).name, f'{result["program_id"]}.gb')
        assert_valid_checksums(self, blinded)

    def test_legacy_dmg_blinding_removes_full_sixteen_byte_title(self) -> None:
        rom = bytearray((index * 29 + 11) & 0xFF for index in range(0x8000))
        rom[0x134:0x144] = b"SIXTEEN-BYTE-ROM"
        rom[0x144:0x14D] = bytes(
            [0x30, 0x31, 0x00, 0x01, 0x00, 0x02, 0x00, 0x33, 0x04]
        )
        fix_checksums(rom)
        original = bytes(rom)

        _, blinded = self.prepare(rom)

        self.assertEqual(blinded[0x134:0x144], bytes(16))
        self.assertEqual(blinded[0x144:0x14D], original[0x144:0x14D])
        changed = set(range(0x134, 0x144)) | {0x14D, 0x14E, 0x14F}
        for index, (before, after) in enumerate(zip(original, blinded)):
            if index not in changed:
                self.assertEqual(after, before, f"unexpected change at {index:#x}")
        assert_valid_checksums(self, blinded)


if __name__ == "__main__":
    unittest.main()
