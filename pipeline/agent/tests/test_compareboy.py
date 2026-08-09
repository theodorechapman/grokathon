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
    normalize_probes,
    oam_differences,
)


class FakeSameBoy:
    def __init__(self, rom: Path) -> None:
        self.rom = Path(rom)
        self.is_candidate = "candidate" in self.rom.name
        self.frames = 0
        self.keys: set[str] = set()
        self.closed = False
        self.watchpoints: list[tuple[int, int, str]] = []

    def read(self, address: int, length: int = 1) -> bytes:
        if address == 0xFF50:
            return b"\x01"
        value = (address + self.frames + (1 if self.is_candidate else 0)) & 0xFF
        return bytes([value]) * length

    def run(self, frames: int, *, max_instructions: int) -> dict:
        self.frames += frames
        if self.watchpoints:
            return {
                "stopped": "watch-write",
                "frames": min(frames, 1),
                "registers": {"pc": 0x1234},
            }
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

    def save_state(self, path: str | Path) -> None:
        Path(path).write_text(str(self.frames))

    def load_state(self, path: str | Path) -> None:
        self.frames = int(Path(path).read_text())

    def add_watchpoint(self, address: int, *, end: int, access: str) -> None:
        self.watchpoints.append((address, end, access))

    def clear_watchpoints(self) -> None:
        self.watchpoints.clear()

    def debug(self, command: str) -> str:
        return f"debug:{command}"

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

    def test_semantic_probes_validate_types_and_bit_fields(self) -> None:
        self.assertEqual(
            normalize_probes(
                [{"name": "velocity", "address": "$c010", "type": "s16le"}]
            )[0]["length"],
            2,
        )
        packed = normalize_probes(
            [{"name": "mode", "address": 0xC011, "type": "u8", "mask": "0x0c", "shift": 2}]
        )[0]
        self.assertEqual((packed["mask"], packed["shift"]), (12, 2))
        with self.assertRaisesRegex(ValueError, "requires length"):
            normalize_probes([{"name": "bad", "address": 0xC000, "type": "u8", "length": 2}])

    def test_oam_localization_decodes_sprite_coordinates(self) -> None:
        original = bytes(160)
        candidate = bytearray(original)
        candidate[4:8] = bytes([32, 24, 7, 0x20])
        differences = oam_differences(original, bytes(candidate))
        self.assertEqual(differences[0]["index"], 1)
        self.assertEqual(differences[0]["candidate"]["screen_x"], 16)
        self.assertEqual(differences[0]["candidate"]["screen_y"], 16)


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

    def test_trace_finds_exact_first_frame_and_decodes_semantic_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            original = root / "original.gb"
            candidate = root / "candidate.gb"
            original.write_bytes(b"original")
            candidate.write_bytes(b"candidate")
            with SameBoyPair(
                original, candidate, artifacts=root / "artifacts",
                screenshot_scale=1, emulator_factory=FakeSameBoy,
            ) as pair:
                pair.boot()
                trace = pair.trace(
                    "motion", 10,
                    probes=[{
                        "name": "mapped-value",
                        "original_address": 0xC000,
                        "candidate_address": 0xC0FF,
                        "type": "u8",
                    }],
                )
                self.assertEqual(trace["observed_frames"], 1)
                self.assertEqual(trace["first_divergence"]["trace_offset"], 1)
                self.assertTrue(trace["samples"][0]["probes"]["mapped-value"]["equal"])
                self.assertIn("frame", trace["first_divergence"]["divergent_channels"])
                self.assertEqual(
                    trace["first_divergence"]["localization"]["oam_entries"][0]["index"], 1
                )

    def test_paired_branch_restore_bisection_and_writer_context(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            original = root / "original.gb"
            candidate = root / "candidate.gb"
            original.write_bytes(b"original")
            candidate.write_bytes(b"candidate")
            with SameBoyPair(original, candidate, emulator_factory=FakeSameBoy) as pair:
                pair.boot()
                pair.run(3)
                with pair.branch("alternate"):
                    pair.run(7)
                    self.assertEqual(pair.elapsed_frames, 10)
                self.assertEqual(pair.elapsed_frames, 3)
                self.assertEqual(pair.original.frames, 3)
                self.assertEqual(pair.candidate.frames, 3)
                bisection = pair.bisect_persistent_divergence("persistent", 8)
                self.assertEqual(bisection["first_persistent_divergence"], 1)
                self.assertEqual(pair.elapsed_frames, 3)
                writer = pair.find_original_writer(0xC123, frames=30)
                self.assertEqual(writer["writer_pc"], 0x1234)
                self.assertEqual(writer["disassembly"], "debug:disassemble/12 pc")
                self.assertEqual(pair.original.frames, 3)


if __name__ == "__main__":
    unittest.main()
