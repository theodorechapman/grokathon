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
from contextlib import contextmanager
import hashlib
import json
import math
import re
import tempfile
from pathlib import Path
from typing import Any, Callable, Iterable

try:
    from sameboy import HarnessError, SameBoy, write_rgb_png
except ModuleNotFoundError:  # Imported as pipeline.agent.compareboy.
    from .sameboy import HarnessError, SameBoy, write_rgb_png


FORMAT_VERSION = 2
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


PROBE_LENGTHS = {"u8": 1, "s8": 1, "u16le": 2, "s16le": 2}


def normalize_probes(probes: Iterable[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Validate named, typed mappings between original and candidate state."""
    normalized = []
    names: set[str] = set()
    for index, item in enumerate(probes or []):
        if not isinstance(item, dict):
            raise ValueError(f"probe {index} must be an object")
        name = item.get("name")
        if not isinstance(name, str) or not name or name in names:
            raise ValueError(f"probe {index} needs a unique nonempty name")
        probe_type = item.get("type", "u8")
        if probe_type not in {*PROBE_LENGTHS, "hex"}:
            raise ValueError(f"probe {name} has unsupported type {probe_type!r}")
        shared_address = item.get("address")
        original_address = _parse_integer(
            item.get("original_address", shared_address),
            f"probe {name} original_address", 0, 0xFFFF,
        )
        candidate_address = _parse_integer(
            item.get("candidate_address", shared_address),
            f"probe {name} candidate_address", 0, 0xFFFF,
        )
        inferred_length = PROBE_LENGTHS.get(probe_type)
        length = _parse_integer(
            item.get("length", inferred_length), f"probe {name} length", 1, 4096
        )
        if inferred_length is not None and length != inferred_length:
            raise ValueError(f"probe {name} type {probe_type} requires length {inferred_length}")
        if original_address + length > 0x10000 or candidate_address + length > 0x10000:
            raise ValueError(f"probe {name} exceeds the CPU address space")
        mask = item.get("mask")
        if mask is not None:
            mask = _parse_integer(mask, f"probe {name} mask", 0, (1 << (length * 8)) - 1)
        shift = _parse_integer(item.get("shift", 0), f"probe {name} shift", 0, length * 8 - 1)
        names.add(name)
        normalized.append(
            {
                "name": name,
                "original_address": original_address,
                "candidate_address": candidate_address,
                "type": probe_type,
                "length": length,
                "mask": mask,
                "shift": shift,
            }
        )
    return normalized


def _decode_probe(data: bytes, probe_type: str, mask: int | None, shift: int) -> int | str:
    if probe_type == "hex":
        return data.hex()
    value = int.from_bytes(data, "little", signed=False)
    if mask is not None:
        value = (value & mask) >> shift
    else:
        if probe_type.startswith("s"):
            value = int.from_bytes(data, "little", signed=True)
        if shift:
            value >>= shift
    return value


def semantic_probe_results(
    original: SameBoy,
    candidate: SameBoy,
    probes: Iterable[dict[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    """Read corresponding state and report decoded values, not layout identity."""
    results = {}
    for item in normalize_probes(probes):
        original_raw = original.read(item["original_address"], item["length"])
        candidate_raw = candidate.read(item["candidate_address"], item["length"])
        original_value = _decode_probe(original_raw, item["type"], item["mask"], item["shift"])
        candidate_value = _decode_probe(candidate_raw, item["type"], item["mask"], item["shift"])
        results[item["name"]] = {
            "equal": original_value == candidate_value,
            "original": original_value,
            "candidate": candidate_value,
            "original_raw": original_raw.hex(),
            "candidate_raw": candidate_raw.hex(),
            **item,
        }
    return results


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


def _oam_entry(data: bytes, index: int) -> dict[str, Any]:
    offset = index * 4
    y, x, tile, flags = data[offset : offset + 4]
    return {
        "index": index,
        "raw_y": y,
        "raw_x": x,
        "screen_y": y - 16,
        "screen_x": x - 8,
        "tile": tile,
        "flags": flags,
    }


def oam_differences(original: bytes, candidate: bytes, *, limit: int = 12) -> list[dict[str, Any]]:
    """Decode differing 4-byte sprite entries into visible coordinates and flags."""
    differences = []
    for index in range(min(len(original), len(candidate)) // 4):
        offset = index * 4
        if original[offset : offset + 4] != candidate[offset : offset + 4]:
            differences.append(
                {
                    "index": index,
                    "original": _oam_entry(original, index),
                    "candidate": _oam_entry(candidate, index),
                }
            )
            if len(differences) == limit:
                break
    return differences


def _vram_region(offset: int) -> str:
    if offset < 0x1800:
        return "tile-data"
    if offset < 0x1C00:
        return "bg-map-0"
    return "bg-map-1"


def localize_video_state(
    original: dict[str, bytes], candidate: dict[str, bytes]
) -> dict[str, Any]:
    """Turn raw video-state byte deltas into sprite/tile/map/palette clues."""
    localization: dict[str, Any] = {}
    if "oam" in original and "oam" in candidate:
        localization["oam_entries"] = oam_differences(original["oam"], candidate["oam"])
    for name in ("vram0", "vram1"):
        if name not in original or name not in candidate:
            continue
        offsets = [
            offset
            for offset, (left, right) in enumerate(zip(original[name], candidate[name]))
            if left != right
        ][:16]
        localization[name] = [
            {
                "offset": offset,
                "cpu_address": 0x8000 + offset,
                "region": _vram_region(offset),
                "original": original[name][offset],
                "candidate": candidate[name][offset],
            }
            for offset in offsets
        ]
    for name in ("bgp", "obp"):
        if name not in original or name not in candidate:
            continue
        localization[name] = [
            {
                "byte": offset,
                "palette": offset // 8,
                "color": (offset % 8) // 2,
                "original": left,
                "candidate": right,
            }
            for offset, (left, right) in enumerate(zip(original[name], candidate[name]))
            if left != right
        ][:16]
    return localization


def _channel_equal(observation: dict[str, Any], channel: str) -> bool:
    if channel == "hardware":
        return observation["hardware_compatible"]
    if channel == "frame":
        return observation["frame"].get("exact", False)
    if channel == "oam":
        return observation["state"].get("oam", {}).get("exact", False)
    if channel == "vram":
        names = [name for name in ("vram0", "vram1") if name in observation["state"]]
        return all(observation["state"][name].get("exact", False) for name in names)
    if channel == "palettes":
        names = [name for name in ("bgp", "obp") if name in observation["state"]]
        return all(observation["state"][name].get("exact", False) for name in names)
    if channel == "memory":
        return all(item.get("exact", False) for item in observation["memory"].values())
    if channel == "probes":
        return all(item["equal"] for item in observation["probes"].values())
    raise ValueError(f"unknown comparison channel {channel!r}")


def _divergent_channels(
    observation: dict[str, Any], channels: Iterable[str]
) -> list[str]:
    return [channel for channel in channels if not _channel_equal(observation, channel)]


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
        self.traces: list[dict[str, Any]] = []
        self.boot_result: dict[str, Any] | None = None
        self._emulator_factory = emulator_factory
        self._temporary_states = tempfile.TemporaryDirectory(prefix="compareboy-")
        self._state_root = (
            self.artifacts / "states"
            if self.artifacts is not None
            else Path(self._temporary_states.name)
        )
        self._saved_pairs: dict[str, dict[str, Any]] = {}
        self.original = emulator_factory(self.original_path)
        try:
            self.candidate = emulator_factory(self.candidate_path)
        except Exception:
            self.original.close()
            self._temporary_states.cleanup()
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

    def reload_pair(
        self,
        candidate_rom: str | Path | None = None,
        **boot_options: Any,
    ) -> dict[str, Any]:
        """Recreate both emulators after a rebuild and boot a fresh experiment pair."""
        if candidate_rom is not None:
            self.candidate_path = Path(candidate_rom).resolve()
        self.candidate.close()
        self.original.close()
        self.original = self._emulator_factory(self.original_path)
        try:
            self.candidate = self._emulator_factory(self.candidate_path)
        except Exception:
            self.original.close()
            raise
        self.elapsed_frames = 0
        self.checkpoints.clear()
        self.traces.clear()
        self._saved_pairs.clear()
        self.boot_result = None
        return self.boot(**boot_options)

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
        probes: Iterable[dict[str, Any]] | None = None,
        write_artifacts: bool = True,
        record: bool = True,
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
            for difference in metrics.get("first_differences", []):
                difference["original_address"] = original_address + difference["offset"]
                difference["candidate_address"] = candidate_address + difference["offset"]
            metrics.update(
                {
                    "original_address": original_address,
                    "candidate_address": candidate_address,
                    "length": length,
                }
            )
            memory_results[item["name"]] = metrics

        checkpoint: dict[str, Any] = {
            "index": len(self.checkpoints) if record else None,
            "name": name,
            "elapsed_frames": self.elapsed_frames,
            "hardware_compatible": self._hardware_signature(original_status)
            == self._hardware_signature(candidate_status),
            "original_hardware": self._hardware_signature(original_status),
            "candidate_hardware": self._hardware_signature(candidate_status),
            "frame": frame_metrics(original_frame, candidate_frame),
            "state": state,
            "memory": memory_results,
            "probes": semantic_probe_results(self.original, self.candidate, probes),
            "localization": localize_video_state(original_state, candidate_state),
        }

        if self.artifacts is not None and write_artifacts:
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

        if record:
            self.checkpoints.append(checkpoint)
        return checkpoint

    def trace(
        self,
        name: str,
        frames: int,
        *,
        buttons: Iterable[str] = (),
        memory: Iterable[dict[str, Any]] | None = None,
        probes: Iterable[dict[str, Any]] | None = None,
        channels: Iterable[str] = ("frame", "oam", "probes"),
        sample_every: int = 1,
        capture_every: int | None = None,
        stop_on_divergence: bool = True,
        max_instructions: int = DEFAULT_MAX_INSTRUCTIONS,
    ) -> dict[str, Any]:
        """Observe a paired experiment frame by frame and preserve its first mismatch."""
        if not isinstance(name, str) or not name:
            raise ValueError("trace name must be a nonempty string")
        frames = _parse_integer(frames, "frames", 1, 1_000_000)
        sample_every = _parse_integer(sample_every, "sample_every", 1, frames)
        if capture_every is not None:
            capture_every = _parse_integer(capture_every, "capture_every", 1, frames)
        channel_list = list(channels)
        for channel in channel_list:
            _channel_equal(
                {
                    "hardware_compatible": True,
                    "frame": {"exact": True},
                    "state": {"oam": {"exact": True}, "vram0": {"exact": True}},
                    "memory": {},
                    "probes": {},
                },
                channel,
            )
        normalized_memory = normalize_memory_ranges(memory)
        normalized_probes = normalize_probes(probes)
        button_list = list(buttons)
        started_at = self.elapsed_frames
        samples = []
        first_divergence = None
        for offset in range(1, frames + 1):
            self.run(1, buttons=button_list, max_instructions=max_instructions)
            observation = self.checkpoint(
                f"{name}-frame-{offset}",
                memory=normalized_memory,
                probes=normalized_probes,
                write_artifacts=False,
                record=False,
            )
            divergent = _divergent_channels(observation, channel_list)
            captured = None
            should_stop = False
            if divergent and first_divergence is None:
                first_divergence = self.checkpoint(
                    f"{name}-first-divergence-{offset}",
                    memory=normalized_memory,
                    probes=normalized_probes,
                    write_artifacts=True,
                    record=True,
                )
                first_divergence["trace_offset"] = offset
                first_divergence["divergent_channels"] = divergent
                captured = first_divergence
                should_stop = stop_on_divergence
            if capture_every is not None and offset % capture_every == 0 and captured is None:
                captured = self.checkpoint(
                    f"{name}-sample-{offset}",
                    memory=normalized_memory,
                    probes=normalized_probes,
                    write_artifacts=True,
                    record=True,
                )
            if offset % sample_every == 0 or divergent or offset == frames:
                sample = {
                    "offset": offset,
                    "elapsed_frames": self.elapsed_frames,
                    "divergent_channels": divergent,
                    "frame_exact": observation["frame"].get("exact", False),
                    "changed_pixels": observation["frame"].get("changed_pixels"),
                    "probes": {
                        key: {
                            "equal": value["equal"],
                            "original": value["original"],
                            "candidate": value["candidate"],
                        }
                        for key, value in observation["probes"].items()
                    },
                }
                if captured is not None:
                    sample["capture"] = {
                        "checkpoint": captured["name"],
                        "artifacts": captured.get("artifacts", {}),
                    }
                samples.append(sample)
            if should_stop:
                break
        trace = {
            "name": name,
            "started_at_elapsed_frame": started_at,
            "requested_frames": frames,
            "observed_frames": self.elapsed_frames - started_at,
            "buttons": button_list,
            "channels": channel_list,
            "sample_every": sample_every,
            "capture_every": capture_every,
            "stopped_on_divergence": bool(first_divergence and stop_on_divergence),
            "first_divergence": first_divergence,
            "samples": samples,
        }
        self.traces.append(trace)
        return trace

    def save_pair(self, name: str) -> dict[str, Any]:
        """Save both emulators so alternate experiments share an exact origin."""
        if not isinstance(name, str) or not name:
            raise ValueError("pair state name must be a nonempty string")
        stem = _safe_name(name)
        self._state_root.mkdir(parents=True, exist_ok=True)
        state = {
            "name": name,
            "elapsed_frames": self.elapsed_frames,
            "original": str((self._state_root / f"{stem}.original.state").resolve()),
            "candidate": str((self._state_root / f"{stem}.candidate.state").resolve()),
        }
        self.original.save_state(state["original"])
        self.candidate.save_state(state["candidate"])
        self._saved_pairs[name] = state
        return dict(state)

    def load_pair(self, state: str | dict[str, Any]) -> dict[str, Any]:
        """Restore a pair previously returned by :meth:`save_pair`."""
        if isinstance(state, str):
            if state not in self._saved_pairs:
                raise ValueError(f"unknown pair state {state!r}")
            resolved = self._saved_pairs[state]
        elif isinstance(state, dict):
            resolved = state
        else:
            raise ValueError("pair state must be a saved name or state object")
        self.original.load_state(resolved["original"])
        self.candidate.load_state(resolved["candidate"])
        self.elapsed_frames = resolved["elapsed_frames"]
        return dict(resolved)

    @contextmanager
    def branch(self, name: str):
        """Restore the paired starting state after an alternate experiment."""
        state = self.save_pair(name)
        try:
            yield self
        finally:
            self.load_pair(state)

    def bisect_persistent_divergence(
        self,
        name: str,
        frames: int,
        *,
        buttons: Iterable[str] = (),
        memory: Iterable[dict[str, Any]] | None = None,
        probes: Iterable[dict[str, Any]] | None = None,
        channels: Iterable[str] = ("frame", "oam", "probes"),
    ) -> dict[str, Any]:
        """Binary-search a mismatch known to persist; use trace() for transient errors."""
        frames = _parse_integer(frames, "frames", 1, 1_000_000)
        start = self.save_pair(f"{name}-bisect-start")
        channel_list = list(channels)

        def observation_at(offset: int) -> tuple[dict[str, Any], list[str]]:
            self.load_pair(start)
            if offset:
                self.run(offset, buttons=buttons)
            observation = self.checkpoint(
                f"{name}-bisect-{offset}", memory=memory, probes=probes,
                write_artifacts=False, record=False,
            )
            return observation, _divergent_channels(observation, channel_list)

        try:
            end_observation, end_channels = observation_at(frames)
            if not end_channels:
                return {"name": name, "first_persistent_divergence": None, "frames": frames}
            low, high = 1, frames
            while low < high:
                middle = (low + high) // 2
                _, divergent = observation_at(middle)
                if divergent:
                    high = middle
                else:
                    low = middle + 1
            observation, divergent = observation_at(low)
            return {
                "name": name,
                "first_persistent_divergence": low,
                "divergent_channels": divergent,
                "observation": observation,
                "assumption": "selected divergence remains present through the searched interval",
            }
        finally:
            self.load_pair(start)

    def find_original_writer(
        self,
        address: int,
        *,
        end: int | None = None,
        frames: int = 3600,
        buttons: Iterable[str] = (),
    ) -> dict[str, Any]:
        """Watch original state writes and return the responsible routine context."""
        address = _parse_integer(address, "address", 0, 0xFFFF)
        end = address if end is None else _parse_integer(end, "end", address, 0xFFFF)
        frames = _parse_integer(frames, "frames", 1, 1_000_000)
        self._state_root.mkdir(parents=True, exist_ok=True)
        restore_path = self._state_root / "writer-probe.original.state"
        self.original.save_state(restore_path)
        button_list = list(buttons)
        try:
            self.original.add_watchpoint(address, end=end, access="write")
            for button in button_list:
                self.original.key(button, True)
            result = self.original.run(frames=frames, max_instructions=DEFAULT_MAX_INSTRUCTIONS)
            context = {
                "address": address,
                "end": end,
                "buttons": button_list,
                "result": result,
                "writer_pc": result.get("registers", {}).get("pc"),
            }
            if result.get("stopped") == "watch-write":
                context["disassembly"] = self.original.debug("disassemble/12 pc")
                context["backtrace"] = self.original.debug("backtrace")
            return context
        finally:
            for button in button_list:
                self.original.key(button, False)
            self.original.clear_watchpoints()
            self.original.load_state(restore_path)

    def report(self, *, script: dict[str, Any] | None = None) -> dict[str, Any]:
        exact = [item["frame"].get("exact", False) for item in self.checkpoints]
        trace_divergence = next(
            (trace["first_divergence"] for trace in self.traces if trace["first_divergence"]),
            None,
        )
        checkpoint_divergence = next(
            (item for item in self.checkpoints if not item["frame"].get("exact", False)), None
        )
        first_divergence = trace_divergence or checkpoint_divergence
        result = {
            "format_version": FORMAT_VERSION,
            "original": {"path": str(self.original_path), "sha256": _sha256(self.original_path.read_bytes())},
            "candidate": {"path": str(self.candidate_path), "sha256": _sha256(self.candidate_path.read_bytes())},
            "boot": self.boot_result,
            "summary": {
                "checkpoints": len(self.checkpoints),
                "exact_frame_checkpoints": sum(exact),
                "traces": len(self.traces),
                "observed_trace_frames": sum(trace["observed_frames"] for trace in self.traces),
                "first_frame_divergence": first_divergence["name"] if first_divergence else None,
                "all_hardware_compatible": all(item["hardware_compatible"] for item in self.checkpoints),
                "interpretation": (
                    "observations only; equality is not evidence of untested behavior or completion"
                ),
            },
            "checkpoints": self.checkpoints,
            "traces": self.traces,
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
        try:
            self.candidate.close()
        finally:
            self.original.close()
            self._temporary_states.cleanup()

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
    normalize_probes(script.get("probes"))
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
        if "trace" in step and not isinstance(step["trace"], bool):
            raise ValueError(f"step {name} trace must be true or false")
        if "sample_every" in step:
            frame_count = _parse_integer(step["frames"], f"step {name} frames", 1, 1_000_000)
            _parse_integer(step["sample_every"], f"step {name} sample_every", 1, frame_count)
        if "capture_every" in step:
            frame_count = _parse_integer(step["frames"], f"step {name} frames", 1, 1_000_000)
            _parse_integer(step["capture_every"], f"step {name} capture_every", 1, frame_count)
        if "stop_on_divergence" in step and not isinstance(step["stop_on_divergence"], bool):
            raise ValueError(f"step {name} stop_on_divergence must be true or false")
        if "channels" in step and (
            not isinstance(step["channels"], list)
            or not all(isinstance(channel, str) for channel in step["channels"])
        ):
            raise ValueError(f"step {name} channels must be a list of names")
        normalize_memory_ranges(step.get("memory"))
        normalize_probes(step.get("probes"))
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
    common_probes = normalize_probes(script.get("probes"))
    with SameBoyPair(
        original,
        candidate,
        artifacts=artifacts,
        screenshot_scale=screenshot_scale,
    ) as pair:
        pair.boot()
        for step in script["steps"]:
            memory = common_memory + normalize_memory_ranges(step.get("memory"))
            probes = common_probes + normalize_probes(step.get("probes"))
            if step.get("trace", False):
                pair.trace(
                    step["name"], step["frames"], buttons=step.get("buttons", []),
                    memory=memory, probes=probes,
                    channels=step.get("channels", ["frame", "oam", "probes"]),
                    sample_every=step.get("sample_every", 1),
                    capture_every=step.get("capture_every"),
                    stop_on_divergence=step.get("stop_on_divergence", True),
                )
                if pair.traces[-1]["stopped_on_divergence"]:
                    break
            else:
                pair.run(step["frames"], buttons=step.get("buttons", []))
                if step.get("checkpoint", True):
                    pair.checkpoint(step["name"], memory=memory, probes=probes)
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
