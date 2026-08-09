#!/usr/bin/env python3
"""Normalize fresh EmulatorHelper reset, state, and lookup evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise FileNotFoundError(f"required Ghidra runtime artifact missing: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"Ghidra artifact is not an object: {path}")
    return value


def normalize(args: argparse.Namespace) -> dict[str, object]:
    bounded = load(args.bounded)
    fresh = load(args.fresh) if args.fresh else None
    validation = load(args.validation) if args.validation else None
    rom = args.rom.read_bytes()
    rom_sha = hashlib.sha256(rom).hexdigest()
    if rom_sha != args.expected_sha:
        raise AssertionError(f"ROM SHA-256 {rom_sha} != {args.expected_sha}")
    if bounded.get("runtime") is not True:
        raise AssertionError("bounded Ghidra artifact lacks runtime evidence")
    if (fresh is None) != (validation is None):
        raise AssertionError("fresh trace and validation must be supplied together")
    reset: list[dict[str, object]] = []
    lookups: list[dict[str, object]] = []
    if fresh is not None and validation is not None:
        if fresh.get("engine") != "Ghidra Sleigh EmulatorHelper":
            raise AssertionError("fresh Ghidra trace has unexpected engine")
        reset = fresh.get("reset_trace")  # type: ignore[assignment]
        lookups = fresh.get("lookup_traces")  # type: ignore[assignment]
        if not isinstance(reset, list) or not reset:
            raise AssertionError("fresh Ghidra reset trace is missing")
        if not isinstance(lookups, list) or len(lookups) != 100:
            raise AssertionError("fresh Ghidra lookup trace count is not 100")
        reset_validation = validation.get("reset", {})
        if not isinstance(reset_validation, dict) or reset_validation.get("passed") is not True:
            raise AssertionError("fresh Ghidra reset validation failed")
        if validation.get("lookup_failure_count") != 0:
            raise AssertionError("fresh Ghidra lookup validation failed")
    raw_events = bounded.get("events")
    if not isinstance(raw_events, list) or not raw_events:
        raise AssertionError("bounded Ghidra instruction events are missing")
    events = []
    register_names: set[str] = set()
    for ordinal, raw in enumerate(raw_events):
        if not isinstance(raw, dict) or raw.get("ordinal") != ordinal:
            raise AssertionError(f"invalid Ghidra event ordinal {ordinal}")
        pc_text = str(raw.get("pc", ""))
        if not pc_text.startswith("CODE:"):
            raise AssertionError(f"non-CODE Ghidra PC {pc_text}")
        pc = int(pc_text.split(":", 1)[1], 16)
        registers = {
            str(name): int(value)
            for name, value in dict(raw.get("registers", {})).items()
        }
        register_names.update(registers)
        events.append({
            "kind": "instruction",
            "ordinal": ordinal,
            "pc": pc,
            "cycles": None,
            "opcode": rom[pc],
            "registers": registers,
            "accesses": [],
            "interrupt_entry": raw.get("interrupt_entry"),
        })
    if reset:
        fresh_reset = [str(step["pc"]).lower() for step in reset]
        bounded_reset = [f"code:{event['pc']:04x}" for event in events[:len(reset)]]
        if fresh_reset != bounded_reset:
            raise AssertionError("fresh and bounded Ghidra reset traces disagree")
    return {
        "schema": "motronic-differential-event/v1",
        "provenance": {
            "engine": "ghidra-emulatorhelper",
            "runtime": True,
            "profile": args.profile,
            "tool_revision": args.version,
            "rom_sha256": rom_sha,
            "rom_size": len(rom),
            "command": args.command,
            "fresh_trace_sha256": digest(args.fresh) if args.fresh else None,
            "bounded_trace_sha256": digest(args.bounded),
            "validation_sha256": (
                digest(args.validation) if args.validation else None
            ),
            "lookup_trace_count": len(lookups),
            "lookup_pass_count": (
                int(validation["lookup_pass_count"]) if validation else 0
            ),
            "fixture_registers": bounded.get("fixture_registers", {}),
        },
        "availability": {
            "cycles": "unavailable",
            "registers": sorted(register_names),
            "access_spaces": {
                "idata": "unavailable", "sfr": "unavailable",
                "xdata": "unavailable",
            },
            "interrupts": "derived-from-runtime-pc",
        },
        "events": events,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bounded", type=Path, required=True)
    parser.add_argument("--fresh", type=Path)
    parser.add_argument("--validation", type=Path)
    parser.add_argument("--rom", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--command", required=True)
    args = parser.parse_args()
    args.output.write_text(
        json.dumps(normalize(args), sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
