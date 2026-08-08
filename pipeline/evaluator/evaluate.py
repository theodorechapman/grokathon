#!/usr/bin/env python3
"""Deterministically compare an original Game Boy ROM with a reconstruction.

This runner is deliberately outside the agent workspace. It applies the same
input timeline to both ROMs, compares native 160x144 RGB checkpoints, checks
motion/input-response parity, and writes a machine-readable evaluation.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE / "agent"))

from sameboy import HarnessError, SameBoy  # noqa: E402


FORMAT_VERSION = 1
DEFAULT_SCRIPT = PIPELINE / "evaluator" / "scripts" / "sanity.json"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _load_script(path: Path) -> dict[str, Any]:
    try:
        script = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"could not read evaluation script {path}: {error}") from error
    if not isinstance(script, dict) or not isinstance(script.get("steps"), list):
        raise ValueError("evaluation script must be an object containing a steps list")
    if not script["steps"]:
        raise ValueError("evaluation script must contain at least one step")

    names = set()
    for index, step in enumerate(script["steps"]):
        if not isinstance(step, dict):
            raise ValueError(f"step {index} must be an object")
        name = step.get("name")
        frames = step.get("frames")
        buttons = step.get("buttons", [])
        if not isinstance(name, str) or not name or name in names:
            raise ValueError(f"step {index} must have a unique nonempty name")
        if isinstance(frames, bool) or not isinstance(frames, int) or frames < 1:
            raise ValueError(f"step {name} frames must be a positive integer")
        if not isinstance(buttons, list) or not all(
            isinstance(button, str) for button in buttons
        ):
            raise ValueError(f"step {name} buttons must be a list of names")
        names.add(name)
    return script


def _safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-") or "checkpoint"


def _mean_absolute_error(left: bytes, right: bytes) -> float:
    if len(left) != len(right):
        return 255.0
    return sum(abs(a - b) for a, b in zip(left, right)) / len(left)


def _frame_metrics(original: bytes, candidate: bytes) -> dict[str, Any]:
    if len(original) != len(candidate):
        return {
            "compatible": False,
            "mean_absolute_error": 255.0,
            "root_mean_square_error": 255.0,
            "similarity": 0.0,
            "exact": False,
        }
    absolute_sum = 0
    square_sum = 0
    within_eight = 0
    for left, right in zip(original, candidate):
        difference = abs(left - right)
        absolute_sum += difference
        square_sum += difference * difference
        within_eight += difference <= 8
    length = len(original)
    mae = absolute_sum / length
    return {
        "compatible": True,
        "mean_absolute_error": round(mae, 6),
        "root_mean_square_error": round(math.sqrt(square_sum / length), 6),
        "similarity": round(max(0.0, 1.0 - mae / 255.0), 6),
        "channels_within_8": round(within_eight / length, 6),
        "exact": absolute_sum == 0,
    }


def _run_rom(
    role: str,
    rom: Path,
    script: dict[str, Any],
    artifacts: Path | None,
) -> tuple[dict[str, Any], list[bytes]]:
    result: dict[str, Any] = {
        "path": str(rom),
        "sha256": _sha256(rom.read_bytes()),
        "ok": False,
        "checkpoints": [],
    }
    frames: list[bytes] = []
    try:
        with SameBoy(rom) as sameboy:
            result["initial"] = sameboy.status()
            total_frames = 0
            previous: bytes | None = None
            transitions = []
            for step in script["steps"]:
                buttons = step.get("buttons", [])
                for button in buttons:
                    sameboy.key(button, True)
                try:
                    stopped = sameboy.run(frames=step["frames"])
                finally:
                    for button in buttons:
                        sameboy.key(button, False)
                if stopped["stopped"] != "frame-limit":
                    raise HarnessError(
                        f"step {step['name']} stopped at {stopped['stopped']}"
                    )
                total_frames += step["frames"]
                frame = sameboy.frame_rgb()
                frames.append(frame)
                checkpoint = {
                    "name": step["name"],
                    "frames": step["frames"],
                    "total_frames": total_frames,
                    "buttons": buttons,
                    "sha256": _sha256(frame),
                    "stop_reason": stopped["stopped"],
                }
                if previous is not None:
                    transition = round(_mean_absolute_error(previous, frame), 6)
                    checkpoint["change_from_previous"] = transition
                    transitions.append(transition)
                previous = frame
                if artifacts is not None:
                    path = artifacts / role / f"{len(frames) - 1:02d}-{_safe_name(step['name'])}.png"
                    path.parent.mkdir(parents=True, exist_ok=True)
                    sameboy.screenshot(path, scale=1)
                    checkpoint["screenshot"] = str(path)
                result["checkpoints"].append(checkpoint)
            result["final"] = sameboy.status()
            hashes = [checkpoint["sha256"] for checkpoint in result["checkpoints"]]
            result["distinct_checkpoint_frames"] = len(set(hashes))
            result["transition_activity"] = transitions
            result["possible_softlock"] = (
                len(hashes) >= 3
                and len(set(hashes[-3:])) == 1
                and any(step.get("buttons") for step in script["steps"][-3:])
            )
            result["ok"] = True
    except (HarnessError, OSError, ValueError) as error:
        result["error"] = str(error)
    return result, frames


def _compare(
    original: dict[str, Any],
    original_frames: list[bytes],
    candidate: dict[str, Any],
    candidate_frames: list[bytes],
    threshold: float,
) -> dict[str, Any]:
    if not original["ok"]:
        return {
            "passed": False,
            "score": 0.0,
            "threshold": threshold,
            "infrastructure_error": "original ROM did not complete evaluation",
            "checkpoints": [],
        }
    if not candidate["ok"]:
        return {
            "passed": False,
            "score": 0.0,
            "threshold": threshold,
            "candidate_booted": False,
            "checkpoints": [],
        }

    checkpoint_results = []
    similarities = []
    for index, (left, right) in enumerate(zip(original_frames, candidate_frames)):
        metrics = _frame_metrics(left, right)
        metrics["name"] = original["checkpoints"][index]["name"]
        metrics["original_sha256"] = original["checkpoints"][index]["sha256"]
        metrics["candidate_sha256"] = candidate["checkpoints"][index]["sha256"]
        checkpoint_results.append(metrics)
        similarities.append(metrics["similarity"])

    motion_results = []
    for index, (left, right) in enumerate(
        zip(original["transition_activity"], candidate["transition_activity"]), start=1
    ):
        denominator = max(left, right, 1.0)
        parity = max(0.0, 1.0 - abs(left - right) / denominator)
        motion_results.append(
            {
                "name": original["checkpoints"][index]["name"],
                "original_change": left,
                "candidate_change": right,
                "parity": round(parity, 6),
            }
        )

    visual = sum(similarities) / len(similarities) if similarities else 0.0
    motion = (
        sum(item["parity"] for item in motion_results) / len(motion_results)
        if motion_results
        else 1.0
    )
    original_distinct = original["distinct_checkpoint_frames"]
    candidate_distinct = candidate["distinct_checkpoint_frames"]
    activity = min(original_distinct, candidate_distinct) / max(
        original_distinct, candidate_distinct, 1
    )
    boot = 1.0
    score = round(100.0 * (0.15 * boot + 0.60 * visual + 0.15 * motion + 0.10 * activity), 3)
    return {
        "passed": score >= threshold,
        "score": score,
        "threshold": threshold,
        "candidate_booted": True,
        "components": {
            "boot": round(boot, 6),
            "visual_similarity": round(visual, 6),
            "motion_parity": round(motion, 6),
            "activity_parity": round(activity, 6),
        },
        "weights": {
            "boot": 0.15,
            "visual_similarity": 0.60,
            "motion_parity": 0.15,
            "activity_parity": 0.10,
        },
        "checkpoints": checkpoint_results,
        "motion": motion_results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--script", type=Path, default=DEFAULT_SCRIPT)
    parser.add_argument("--output", type=Path, default=Path("evaluation.json"))
    parser.add_argument("--artifacts", type=Path)
    parser.add_argument("--threshold", type=float, default=90.0)
    args = parser.parse_args()

    if not 0 <= args.threshold <= 100:
        parser.error("threshold must be between 0 and 100")
    original_path = args.original.resolve()
    candidate_path = args.candidate.resolve()
    if not original_path.is_file():
        parser.error(f"original ROM not found: {original_path}")
    if not candidate_path.is_file():
        parser.error(f"candidate ROM not found: {candidate_path}")

    script_path = args.script.resolve()
    try:
        script = _load_script(script_path)
    except ValueError as error:
        parser.error(str(error))

    artifacts = args.artifacts.resolve() if args.artifacts else None
    original, original_frames = _run_rom(
        "original", original_path, script, artifacts
    )
    candidate, candidate_frames = _run_rom(
        "candidate", candidate_path, script, artifacts
    )
    comparison = _compare(
        original,
        original_frames,
        candidate,
        candidate_frames,
        args.threshold,
    )
    report = {
        "format_version": FORMAT_VERSION,
        "script": {
            "path": str(script_path),
            "sha256": _sha256(script_path.read_bytes()),
            "name": script.get("name", script_path.stem),
        },
        "original": original,
        "candidate": candidate,
        "comparison": comparison,
    }
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"output": str(output), **comparison}, indent=2))
    return 0 if comparison["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
