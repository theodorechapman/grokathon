from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path


AGENT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENT_DIR))

from compareboy import (  # noqa: E402
    SameBoyPair,
    byte_metrics,
    difference_frame,
    frame_metrics,
    load_script,
    normalize_memory_ranges,
)


class FakeSameBoy:
    def __init__(self, rom: Path) -> None:
        self.rom = Path(rom)
        self.is_candidate = "candidate" in self.rom.name
        self.frames = 0
        self.keys: set[str] = set()
        self.closed = False

    def read(self, address: int, length: int = 1) -> bytes:
        if address == 0xFF50:
            return b"\x01"
        value = (address + self.frames + (1 if self.is_candidate else 0)) & 0xFF
        return bytes([value]) * length

    def run(self, frames: int, *, max_instructions: int) -> dict:
        self.frames += frames
        return {"stopped": "frame-limit", "frames": frames}

    def key(self, button: str, pressed: bool) -> None:
        if pressed:
            self.keys.add(button)
        else:
            self.keys.discard(button)

    def status(self) -> dict:
        return {
            "hardware": {"model": "cgb", "cgb_mode": True},
            "frames": self.frames,
        }

    def frame_rgb(self) -> bytes:
        value = (self.frames + (1 if self.is_candidate else 0)) & 0xFF
        return bytes([value]) * (160 * 144 * 3)

    def vram_bank(self, bank: int) -> bytes:
        return bytes([bank]) * 0x2000

    def palette(self, *, objects: bool = False) -> bytes:
        return bytes([1 if objects else 0]) * 64

    def oam(self) -> bytes:
        data = bytearray(160)
        if self.is_candidate:
            data[5] = 1
        return bytes(data)

    def close(self) -> None:
        self.closed = True


class MetricTests(unittest.TestCase):
    def test_byte_metrics_reports_offsets_and_hashes(self) -> None:
        result = byte_metrics(b"\x00\x01\x02", b"\x00\x03\x02")
        self.assertFalse(result["exact"])
        self.assertEqual(result["different_bytes"], 1)
        self.assertEqual(
            result["first_differences"],
            [{"offset": 1, "original": 1, "candidate": 3}],
        )
        self.assertEqual(len(result["original_sha256"]), 64)

    def test_frame_metrics_locates_changed_pixel(self) -> None:
        original = bytes(160 * 144 * 3)
        candidate = bytearray(original)
        offset = (7 * 160 + 11) * 3
        candidate[offset] = 12
        result = frame_metrics(original, bytes(candidate))
        self.assertEqual(result["changed_pixels"], 1)
        self.assertEqual(
            result["difference_bounds"],
            {"left": 11, "top": 7, "right": 11, "bottom": 7},
        )
        heatmap = difference_frame(original, bytes(candidate))
        self.assertEqual(heatmap[offset : offset + 3], b"\x30\x0c\x0c")

    def test_memory_ranges_accept_hex_and_reject_overlap_with_address_space(self) -> None:
        self.assertEqual(
            normalize_memory_ranges([{"name": "player", "address": "$c4ec", "length": "0x08"}]),
            [
                {
                    "name": "player",
                    "original_address": 0xC4EC,
                    "candidate_address": 0xC4EC,
                    "length": 8,
                }
            ],
        )
        self.assertEqual(
            normalize_memory_ranges(
                [
                    {
                        "name": "mapped-player",
                        "original_address": "$c4ec",
                        "candidate_address": "$c100",
                        "length": 2,
                    }
                ]
            )[0]["candidate_address"],
            0xC100,
        )
        with self.assertRaisesRegex(ValueError, "exceeds"):
            normalize_memory_ranges([{"name": "bad", "address": 0xFFFF, "length": 2}])


class PairTests(unittest.TestCase):
    def test_pair_writes_lossless_checkpoint_images_and_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            original = root / "original.gb"
            candidate = root / "candidate.gb"
            original.write_bytes(b"original")
            candidate.write_bytes(b"candidate")
            artifacts = root / "artifacts"

            with SameBoyPair(
                original,
                candidate,
                artifacts=artifacts,
                screenshot_scale=1,
                emulator_factory=FakeSameBoy,
            ) as pair:
                boot = pair.boot()
                self.assertTrue(boot["hardware_compatible"])
                pair.run(4, buttons=["right"])
                checkpoint = pair.checkpoint(
                    "move right",
                    memory=[
                        {
                            "name": "player",
                            "original_address": 0xC000,
                            "candidate_address": 0xC001,
                            "length": 4,
                        }
                    ],
                )
                report_path = pair.write_report(root / "comparison.json")

            self.assertEqual(checkpoint["elapsed_frames"], 4)
            self.assertEqual(checkpoint["state"]["oam"]["different_bytes"], 1)
            self.assertEqual(checkpoint["memory"]["player"]["different_bytes"], 4)
            self.assertEqual(
                set(checkpoint["artifacts"]),
                {"original", "candidate", "difference", "overview"},
            )
            for kind, image_path in checkpoint["artifacts"].items():
                png = Path(image_path).read_bytes()
                self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
                expected_size = (480, 144) if kind == "overview" else (160, 144)
                self.assertEqual(struct.unpack(">II", png[16:24]), expected_size)
            report = json.loads(report_path.read_text())
            self.assertEqual(report["summary"]["first_frame_divergence"], "move right")

    def test_script_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            script = Path(temporary_directory) / "script.json"
            script.write_text(json.dumps({"steps": [{"name": "idle", "frames": 1}]}))
            self.assertEqual(load_script(script)["steps"][0]["name"], "idle")


if __name__ == "__main__":
    unittest.main()
