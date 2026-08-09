#!/usr/bin/env python3
"""Normalize one fresh MAME debugger run into the differential contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

STATE = re.compile(
    r"^N=\d+ CYC=(\d+) PC=([0-9A-F]{4}) A=([0-9A-F]{2}) "
    r"B=([0-9A-F]{2}) PSW=([0-9A-F]{2}) SP=([0-9A-F]{2}) "
    r"DPTR=([0-9A-F]{4}) IE=([0-9A-F]{2}) IP=([0-9A-F]{2})$",
    re.MULTILINE | re.IGNORECASE,
)
VECTORS = {
    0x0003: "external-0", 0x000B: "timer-0", 0x0013: "external-1",
    0x001B: "timer-1", 0x0023: "uart", 0x002B: "timer-2",
    0x0043: "adc", 0x0053: "external-3",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_accesses(text: str) -> list[dict[str, object]]:
    accesses = []
    for line_number, line in enumerate(text.splitlines(), 1):
        marker = line.find("EVT {")
        if marker < 0:
            continue
        try:
            raw = json.loads(line[marker + 4:])
        except json.JSONDecodeError as error:
            raise ValueError(f"invalid EVT JSON at line {line_number}") from error
        if raw.get("kind") != "access" or raw.get("space") == "port":
            continue
        accesses.append({
            "space": str(raw["space"]).lower(),
            "access": str(raw["access"]).lower(),
            "address": int(str(raw["address"]), 16),
            "data": int(str(raw["data"]), 16),
            "cycles": int(raw["cycles"]),
            "reported_pc": int(str(raw["pc"]), 16),
            "source": "mame-driver-runtime",
        })
    return accesses


def normalize(args: argparse.Namespace) -> dict[str, object]:
    for path in (args.trace, args.console, args.rom, args.binary):
        if not path.is_file():
            raise FileNotFoundError(f"required runtime input missing: {path}")
    rom_sha = digest(args.rom)
    if rom_sha != args.expected_sha:
        raise AssertionError(f"ROM SHA-256 {rom_sha} != {args.expected_sha}")
    trace_text = args.trace.read_text(encoding="utf-8")
    console_text = args.console.read_text(encoding="utf-8")
    if '"kind":"run"' not in console_text or '"runtime":true' not in console_text:
        raise AssertionError("MAME console lacks runtime run provenance")
    matches = STATE.findall(trace_text)
    if not matches:
        raise AssertionError("MAME trace has no register-tagged boundaries")
    rom = args.rom.read_bytes()
    accesses = parse_accesses(trace_text)
    events: list[dict[str, object]] = []
    for ordinal, match in enumerate(matches):
        cycle = int(match[0])
        pc = int(match[1], 16)
        registers = {
            name: int(value, 16)
            for name, value in zip(
                ("a", "b", "psw", "sp", "dptr", "ie", "ip"), match[2:]
            )
        }
        attached = [
            {key: value for key, value in access.items() if key != "cycles"}
            for access in accesses if access["cycles"] == cycle
        ]
        events.append({
            "kind": "instruction",
            "ordinal": ordinal,
            "pc": pc,
            "cycles": cycle,
            "opcode": rom[pc],
            "registers": registers,
            "accesses": attached,
            "interrupt_entry": VECTORS.get(pc) if ordinal else None,
        })
    cycles = [int(event["cycles"]) for event in events]
    if any(right <= left for left, right in zip(cycles, cycles[1:])):
        raise AssertionError("MAME instruction cycles are not strictly monotonic")
    event_cycles = {event["cycles"] for event in events}
    unattached = [
        access for access in accesses if access["cycles"] not in event_cycles
    ]
    if unattached:
        raise AssertionError(f"MAME accesses lack instruction boundary: {unattached}")
    return {
        "schema": "motronic-differential-event/v1",
        "provenance": {
            "engine": "mame",
            "runtime": True,
            "profile": args.profile,
            "tool_revision": args.commit,
            "rom_sha256": rom_sha,
            "rom_size": len(rom),
            "command": args.command,
            "binary_sha256": digest(args.binary),
            "trace_sha256": digest(args.trace),
            "console_sha256": digest(args.console),
        },
        "availability": {
            "cycles": "observed",
            "registers": ["a", "b", "psw", "sp", "dptr", "ie", "ip"],
            "access_spaces": {
                "idata": "unavailable", "sfr": "observed", "xdata": "observed",
            },
            "interrupts": "derived-from-runtime-pc",
        },
        "events": events,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace", type=Path, required=True)
    parser.add_argument("--console", type=Path, required=True)
    parser.add_argument("--rom", type=Path, required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--command", required=True)
    args = parser.parse_args()
    args.output.write_text(
        json.dumps(normalize(args), sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
