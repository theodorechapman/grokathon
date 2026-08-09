#!/usr/bin/env python3
"""Run an original and reconstructed Game Boy ROM in lockstep.

The API is intended for the reconstruction agent's inner development loop. It
boots each cartridge past its own boot-ROM boundary, applies identical inputs,
and compares lossless frame, VRAM, palette, OAM, and selected memory snapshots.
Checkpoint artifacts include separate original/candidate/diff PNGs, a compact
overview triptych, and JSON; video is deliberately not the machine oracle.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any, Callable, Iterable

try:
    from sameboy import HarnessError, SameBoy, write_rgb_png
except ModuleNotFoundError:  # Imported as pipeline.agent.compareboy.
    from .sameboy import HarnessError, SameBoy, write_rgb_png


FORMAT_VERSION = 1
DEFAULT_BOOT_CHUNK_FRAMES = 60
DEFAULT_BOOT_MAX_FRAMES = 1200
DEFAULT_MAX_INSTRUCTIONS = 50_000_000


class ComparisonError(RuntimeError):
    pass


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-") or "checkpoint"


def _parse_integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{name} must be an integer")
    if isinstance(value, str):
        try:
            value = int(value[1:], 16) if value.startswith("$") else int(value, 0)
        except ValueError as error:
            raise ValueError(f"{name} must be an integer") from error
    if not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be in range {minimum}..{maximum}")
    return value


def normalize_memory_ranges(ranges: Iterable[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Validate named original/candidate CPU-memory mappings for checkpoints."""
    normalized = []
    names: set[str] = set()
    for index, item in enumerate(ranges or []):
        if not isinstance(item, dict):
            raise ValueError(f"memory range {index} must be an object")
        name = item.get("name", f"range-{index}")
        if not isinstance(name, str) or not name or name in names:
            raise ValueError(f"memory range {index} needs a unique nonempty name")
        shared_address = item.get("address")
        original_address = _parse_integer(
            item.get("original_address", shared_address),
            f"memory range {name} original_address",
            0,
            0xFFFF,
        )
        candidate_address = _parse_integer(
            item.get("candidate_address", shared_address),
            f"memory range {name} candidate_address",
            0,
            0xFFFF,
        )
        length = _parse_integer(item.get("length"), f"memory range {name} length", 1, 4096)
        if original_address + length > 0x10000:
            raise ValueError(f"memory range {name} exceeds the original address space")
        if candidate_address + length > 0x10000:
            raise ValueError(f"memory range {name} exceeds the candidate address space")
        names.add(name)
        normalized.append(
            {
                "name": name,
                "original_address": original_address,
                "candidate_address": candidate_address,
                "length": length,
            }
        )
    return normalized


def byte_metrics(original: bytes, candidate: bytes, *, preview: int = 16) -> dict[str, Any]:
    """Return exact byte-level diagnostics without embedding full snapshots."""
    if len(original) != len(candidate):
        return {
            "compatible": False,
            "exact": False,
            "original_bytes": len(original),
            "candidate_bytes": len(candidate),
        }
    absolute_sum = 0
    different = 0
    first_differences = []
    for offset, (left, right) in enumerate(zip(original, candidate)):
        difference = abs(left - right)
        absolute_sum += difference
        if difference:
            different += 1
            if len(first_differences) < preview:
                first_differences.append(
                    {"offset": offset, "original": left, "candidate": right}
                )
    length = len(original)
    return {
        "compatible": True,
        "exact": different == 0,
        "bytes": length,
        "different_bytes": different,
        "matching_fraction": round((length - different) / length, 6) if length else 1.0,
        "mean_absolute_error": round(absolute_sum / length, 6) if length else 0.0,
        "original_sha256": _sha256(original),
        "candidate_sha256": _sha256(candidate),
        "first_differences": first_differences,
    }


def frame_metrics(original: bytes, candidate: bytes) -> dict[str, Any]:
    """Compare native RGB frames and locate the changed-pixel bounding box."""
    metrics = byte_metrics(original, candidate)
    if not metrics["compatible"]:
        metrics.update({"root_mean_square_error": 255.0, "changed_pixels": None})
        return metrics

    square_sum = 0
    changed_pixels = 0
    near_pixels = 0
    min_x = min_y = None
    max_x = max_y = None
    for pixel, offset in enumerate(range(0, len(original), 3)):
        differences = [abs(original[offset + channel] - candidate[offset + channel]) for channel in range(3)]
        square_sum += sum(value * value for value in differences)
        maximum = max(differences)
        if maximum <= 8:
            near_pixels += 1
        if maximum:
            changed_pixels += 1
            x, y = pixel % 160, pixel // 160
            min_x = x if min_x is None else min(min_x, x)
            min_y = y if min_y is None else min(min_y, y)
            max_x = x if max_x is None else max(max_x, x)
            max_y = y if max_y is None else max(max_y, y)

    pixels = len(original) // 3
    metrics.update(
        {
            "root_mean_square_error": round(math.sqrt(square_sum / len(original)), 6),
            "similarity": round(max(0.0, 1.0 - metrics["mean_absolute_error"] / 255.0), 6),
            "changed_pixels": changed_pixels,
            "exact_pixel_fraction": round((pixels - changed_pixels) / pixels, 6),
            "pixels_within_8_fraction": round(near_pixels / pixels, 6),
            "difference_bounds": None
            if min_x is None
            else {"left": min_x, "top": min_y, "right": max_x, "bottom": max_y},
        }
    )
    return metrics


def difference_frame(original: bytes, candidate: bytes, *, amplification: int = 4) -> bytes:
    """Create a black/red lossless heatmap; non-black pixels are differences."""
    if len(original) != len(candidate):
        raise ValueError("frames must have equal lengths")
    output = bytearray(len(original))
    for offset in range(0, len(original), 3):
        delta = max(abs(original[offset + channel] - candidate[offset + channel]) for channel in range(3))
        output[offset] = min(255, delta * amplification)
        output[offset + 1] = min(255, delta)
        output[offset + 2] = min(255, delta)
    return bytes(output)


def comparison_strip(original: bytes, candidate: bytes, difference: bytes) -> bytes:
    """Join original, candidate, and difference left-to-right for quick review."""
    row_bytes = 160 * 3
    output = bytearray()
    for offset in range(0, len(original), row_bytes):
        output.extend(original[offset : offset + row_bytes])
        output.extend(candidate[offset : offset + row_bytes])
        output.extend(difference[offset : offset + row_bytes])
    return bytes(output)


class SameBoyPair:
    """Two independent SameBoy instances driven by the same frame/input timeline."""

    def __init__(
        self,
        original_rom: str | Path,
        candidate_rom: str | Path,
        *,
        artifacts: str | Path | None = None,
        screenshot_scale: int = 3,
        emulator_factory: Callable[..., SameBoy] = SameBoy,
    ) -> None:
        self.original_path = Path(original_rom).resolve()
        self.candidate_path = Path(candidate_rom).resolve()
        self.artifacts = Path(artifacts).resolve() if artifacts is not None else None
        self.screenshot_scale = screenshot_scale
        self.elapsed_frames = 0
        self.checkpoints: list[dict[str, Any]] = []
        self.boot_result: dict[str, Any] | None = None
        self.original = emulator_factory(self.original_path)
        try:
            self.candidate = emulator_factory(self.candidate_path)
        except Exception:
            self.original.close()
            raise

    @staticmethod
    def _run_checked(emulator: SameBoy, frames: int, max_instructions: int) -> dict[str, Any]:
        result = emulator.run(frames=frames, max_instructions=max_instructions)
        if result["stopped"] != "frame-limit":
            raise ComparisonError(
                f"emulator stopped at {result['stopped']} after {result['frames']} frames"
            )
        return result

    def _boot_one(
        self,
        emulator: SameBoy,
        *,
        chunk_frames: int,
        max_frames: int,
        max_instructions: int,
    ) -> dict[str, Any]:
        consumed = 0
        while not (emulator.read(0xFF50)[0] & 1):
            if consumed >= max_frames:
                raise ComparisonError(f"boot ROM did not unmap within {max_frames} frames")
            self._run_checked(emulator, min(chunk_frames, max_frames - consumed), max_instructions)
            consumed += min(chunk_frames, max_frames - consumed)
        return {"frames": consumed, "status": emulator.status()}

    def boot(
        self,
        *,
        chunk_frames: int = DEFAULT_BOOT_CHUNK_FRAMES,
        max_frames: int = DEFAULT_BOOT_MAX_FRAMES,
        max_instructions: int = DEFAULT_MAX_INSTRUCTIONS,
    ) -> dict[str, Any]:
        """Boot each ROM independently, then align time at cartridge execution."""
        original = self._boot_one(
            self.original,
            chunk_frames=chunk_frames,
            max_frames=max_frames,
            max_instructions=max_instructions,
        )
        candidate = self._boot_one(
            self.candidate,
            chunk_frames=chunk_frames,
            max_frames=max_frames,
            max_instructions=max_instructions,
        )
        self.elapsed_frames = 0
        self.boot_result = {
            "original": original,
            "candidate": candidate,
            "hardware_compatible": self._hardware_signature(original["status"])
            == self._hardware_signature(candidate["status"]),
        }
        return self.boot_result

    @staticmethod
    def _hardware_signature(status: dict[str, Any]) -> dict[str, Any]:
        hardware = status["hardware"]
        return {"model": hardware["model"], "cgb_mode": hardware["cgb_mode"]}

    def run(
        self,
        frames: int,
        *,
        buttons: Iterable[str] = (),
        max_instructions: int = DEFAULT_MAX_INSTRUCTIONS,
    ) -> dict[str, Any]:
        """Hold the same buttons on both ROMs for an identical frame count."""
        frames = _parse_integer(frames, "frames", 1, 1_000_000)
        button_list = list(buttons)
        for emulator in (self.original, self.candidate):
            for button in button_list:
                emulator.key(button, True)
        try:
            original = self._run_checked(self.original, frames, max_instructions)
            candidate = self._run_checked(self.candidate, frames, max_instructions)
        finally:
            for emulator in (self.original, self.candidate):
                for button in button_list:
                    emulator.key(button, False)
        self.elapsed_frames += frames
        return {"frames": frames, "buttons": button_list, "original": original, "candidate": candidate}

    def press(self, button: str, frames: int = 1) -> dict[str, Any]:
        return self.run(frames, buttons=[button])

    @staticmethod
    def _state_bytes(emulator: SameBoy) -> dict[str, bytes]:
        status = emulator.status()
        state = {"vram0": emulator.vram_bank(0), "oam": emulator.oam()}
        if status["hardware"]["cgb_mode"]:
            state.update(
                {
                    "vram1": emulator.vram_bank(1),
                    "bgp": emulator.palette(objects=False),
                    "obp": emulator.palette(objects=True),
                }
            )
        return state

    def checkpoint(
        self,
        name: str,
        *,
        memory: Iterable[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Compare the current synchronized state and optionally write PNGs."""
        if not isinstance(name, str) or not name:
            raise ValueError("checkpoint name must be a nonempty string")
        ranges = normalize_memory_ranges(memory)
        original_frame = self.original.frame_rgb()
        candidate_frame = self.candidate.frame_rgb()
        original_status = self.original.status()
        candidate_status = self.candidate.status()
        original_state = self._state_bytes(self.original)
        candidate_state = self._state_bytes(self.candidate)

        state_names = sorted(set(original_state) | set(candidate_state))
        state = {}
        for state_name in state_names:
            if state_name not in original_state or state_name not in candidate_state:
                state[state_name] = {
                    "compatible": False,
                    "exact": False,
                    "original_present": state_name in original_state,
                    "candidate_present": state_name in candidate_state,
                }
            else:
                state[state_name] = byte_metrics(
                    original_state[state_name], candidate_state[state_name]
                )

        memory_results = {}
        for item in ranges:
            original_address = item["original_address"]
            candidate_address = item["candidate_address"]
            length = item["length"]
            metrics = byte_metrics(
                self.original.read(original_address, length),
                self.candidate.read(candidate_address, length),
            )
            metrics.update(
                {
                    "original_address": original_address,
                    "candidate_address": candidate_address,
                    "length": length,
                }
            )
            memory_results[item["name"]] = metrics

        checkpoint: dict[str, Any] = {
            "index": len(self.checkpoints),
            "name": name,
            "elapsed_frames": self.elapsed_frames,
            "hardware_compatible": self._hardware_signature(original_status)
            == self._hardware_signature(candidate_status),
            "original_hardware": self._hardware_signature(original_status),
            "candidate_hardware": self._hardware_signature(candidate_status),
            "frame": frame_metrics(original_frame, candidate_frame),
            "state": state,
            "memory": memory_results,
        }

        if self.artifacts is not None:
            stem = f"{len(self.checkpoints):02d}-{_safe_name(name)}"
            difference = difference_frame(original_frame, candidate_frame)
            paths = {
                "original": write_rgb_png(
                    self.artifacts / f"{stem}.original.png",
                    original_frame,
                    scale=self.screenshot_scale,
                ),
                "candidate": write_rgb_png(
                    self.artifacts / f"{stem}.candidate.png",
                    candidate_frame,
                    scale=self.screenshot_scale,
                ),
                "difference": write_rgb_png(
                    self.artifacts / f"{stem}.diff.png",
                    difference,
                    scale=self.screenshot_scale,
                ),
                "overview": write_rgb_png(
                    self.artifacts / f"{stem}.overview.png",
                    comparison_strip(original_frame, candidate_frame, difference),
                    scale=self.screenshot_scale,
                    width=480,
                    height=144,
                ),
            }
            checkpoint["artifacts"] = {key: str(path) for key, path in paths.items()}

        self.checkpoints.append(checkpoint)
        return checkpoint

    def report(self, *, script: dict[str, Any] | None = None) -> dict[str, Any]:
        similarities = [item["frame"].get("similarity", 0.0) for item in self.checkpoints]
        exact = [item["frame"].get("exact", False) for item in self.checkpoints]
        first_divergence = next(
            (item["name"] for item in self.checkpoints if not item["frame"].get("exact", False)),
            None,
        )
        result = {
            "format_version": FORMAT_VERSION,
            "original": {"path": str(self.original_path), "sha256": _sha256(self.original_path.read_bytes())},
            "candidate": {"path": str(self.candidate_path), "sha256": _sha256(self.candidate_path.read_bytes())},
            "boot": self.boot_result,
            "summary": {
                "checkpoints": len(self.checkpoints),
                "exact_frame_checkpoints": sum(exact),
                "mean_frame_similarity": round(sum(similarities) / len(similarities), 6) if similarities else None,
                "first_frame_divergence": first_divergence,
                "all_hardware_compatible": all(item["hardware_compatible"] for item in self.checkpoints),
            },
            "checkpoints": self.checkpoints,
        }
        if script is not None:
            result["script"] = script
        return result

    def write_report(self, path: str | Path, *, script: dict[str, Any] | None = None) -> Path:
        destination = Path(path).resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(self.report(script=script), indent=2, sort_keys=True) + "\n")
        return destination

    def close(self) -> None:
        self.candidate.close()
        self.original.close()

    def __enter__(self) -> "SameBoyPair":
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.close()


def load_script(path: str | Path) -> dict[str, Any]:
    source = Path(path)
    try:
        script = json.loads(source.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"could not read comparison script {source}: {error}") from error
    if not isinstance(script, dict) or not isinstance(script.get("steps"), list) or not script["steps"]:
        raise ValueError("comparison script must be an object containing a nonempty steps list")
    normalize_memory_ranges(script.get("memory"))
    names: set[str] = set()
    for index, step in enumerate(script["steps"]):
        if not isinstance(step, dict):
            raise ValueError(f"step {index} must be an object")
        name = step.get("name")
        if not isinstance(name, str) or not name or name in names:
            raise ValueError(f"step {index} needs a unique nonempty name")
        _parse_integer(step.get("frames"), f"step {name} frames", 1, 1_000_000)
        buttons = step.get("buttons", [])
        if not isinstance(buttons, list) or not all(isinstance(button, str) for button in buttons):
            raise ValueError(f"step {name} buttons must be a list of names")
        if "checkpoint" in step and not isinstance(step["checkpoint"], bool):
            raise ValueError(f"step {name} checkpoint must be true or false")
        normalize_memory_ranges(step.get("memory"))
        names.add(name)
    return script


def run_script(
    original: Path,
    candidate: Path,
    script: dict[str, Any],
    *,
    artifacts: Path | None,
    screenshot_scale: int,
) -> dict[str, Any]:
    common_memory = normalize_memory_ranges(script.get("memory"))
    with SameBoyPair(
        original,
        candidate,
        artifacts=artifacts,
        screenshot_scale=screenshot_scale,
    ) as pair:
        pair.boot()
        for step in script["steps"]:
            pair.run(step["frames"], buttons=step.get("buttons", []))
            if step.get("checkpoint", True):
                memory = common_memory + normalize_memory_ranges(step.get("memory"))
                pair.checkpoint(step["name"], memory=memory)
        return pair.report(script=script)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--script", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("comparison.json"))
    parser.add_argument("--artifacts", type=Path)
    parser.add_argument("--screenshot-scale", type=int, default=3)
    args = parser.parse_args()

    try:
        script = load_script(args.script)
        report = run_script(
            args.original.resolve(),
            args.candidate.resolve(),
            script,
            artifacts=args.artifacts.resolve() if args.artifacts else None,
            screenshot_scale=args.screenshot_scale,
        )
    except (ComparisonError, HarnessError, OSError, ValueError) as error:
        parser.exit(2, f"compareboy: {error}\n")

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"output": str(output), **report["summary"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
