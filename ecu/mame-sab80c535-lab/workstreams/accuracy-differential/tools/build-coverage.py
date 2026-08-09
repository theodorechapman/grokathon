#!/usr/bin/env python3
"""Build the machine-readable evidence coverage summary."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"expected object in {path}")
    return value


def ranges(values: list[int]) -> list[str]:
    if not values:
        return []
    groups: list[tuple[int, int]] = []
    start = previous = values[0]
    for value in values[1:]:
        if value - previous > 4:
            groups.append((start, previous))
            start = value
        previous = value
    groups.append((start, previous))
    return [
        f"{start:04x}" if start == end else f"{start:04x}-{end:04x}"
        for start, end in groups
    ]


def stream_coverage(document: dict[str, Any]) -> dict[str, Any]:
    events = document["events"]
    pcs = sorted({int(event["pc"]) for event in events})
    opcodes = sorted({int(event["opcode"]) for event in events})
    accesses: Counter[str] = Counter()
    addresses: dict[str, set[int]] = {
        "idata": set(), "sfr": set(), "xdata": set(),
    }
    for event in events:
        for item in event.get("accesses", []):
            memory_space = str(item["space"])
            accesses[f"{memory_space}.{item['access']}"] += 1
            addresses.setdefault(memory_space, set()).add(int(item["address"]))
    cycles = [
        int(event["cycles"]) for event in events
        if event.get("cycles") is not None
    ]
    interrupts = [
        {"ordinal": event["ordinal"], "vector": event["interrupt_entry"]}
        for event in events if event.get("interrupt_entry")
    ]
    return {
        "instruction_boundaries": len(events),
        "unique_instruction_addresses": len(pcs),
        "address_ranges": ranges(pcs),
        "unique_opcodes": [f"{opcode:02x}" for opcode in opcodes],
        "cycle_span": [min(cycles), max(cycles)] if cycles else None,
        "access_counts": dict(sorted(accesses.items())),
        "access_address_ranges": {
            name: ranges(sorted(values)) for name, values in addresses.items()
        },
        "interrupt_entries": interrupts,
        "availability": document["availability"],
        "provenance": document["provenance"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--canonical-mame", type=Path, required=True)
    parser.add_argument("--canonical-ghidra", type=Path, required=True)
    parser.add_argument("--canonical-static", type=Path, required=True)
    parser.add_argument("--canonical-exact", type=Path, required=True)
    parser.add_argument("--canonical-masked", type=Path, required=True)
    parser.add_argument("--canonical-pair", type=Path, required=True)
    parser.add_argument("--microcase-mame", type=Path, required=True)
    parser.add_argument("--microcase-ghidra", type=Path, required=True)
    parser.add_argument("--microcase-static", type=Path, required=True)
    parser.add_argument("--microcase-exact", type=Path, required=True)
    parser.add_argument("--microcase-pair", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    canonical_documents = {
        "mame": load(args.canonical_mame),
        "ghidra": load(args.canonical_ghidra),
        "static": load(args.canonical_static),
    }
    microcase_documents = {
        "mame": load(args.microcase_mame),
        "ghidra": load(args.microcase_ghidra),
        "static": load(args.microcase_static),
    }
    exact = load(args.canonical_exact)
    masked = load(args.canonical_masked)
    report = {
        "schema": "motronic-differential-coverage/v1",
        "qualification": (
            "Software differential evidence only; not an ECU accuracy, "
            "vehicle, electrical, ASIC, or safety validation claim."
        ),
        "canonical": {
            "streams": {
                name: stream_coverage(document)
                for name, document in canonical_documents.items()
            },
            "mame_static_exact": load(args.canonical_pair),
            "three_way_exact": exact,
            "three_way_masked": masked,
            "exact_agreement_prefix_events": exact["agreement_prefix_events"],
            "first_divergence": exact["first_divergence"],
            "compared_fields": masked["compared_fields"],
            "unmatched_fields": masked["unmatched_fields"],
            "lookup_validation": {
                "trace_count": canonical_documents["ghidra"]["provenance"][
                    "lookup_trace_count"
                ],
                "pass_count": canonical_documents["ghidra"]["provenance"][
                    "lookup_pass_count"
                ],
            },
        },
        "microcase": {
            "features": [
                "ADD/SUBB flags", "stack PUSH/POP", "MOVC", "MOVX",
                "bit CLR/SETB/JB", "taken-branch timing",
            ],
            "streams": {
                name: stream_coverage(document)
                for name, document in microcase_documents.items()
            },
            "mame_static_exact": load(args.microcase_pair),
            "three_way_exact": load(args.microcase_exact),
        },
        "negative_gates": [
            "corrupted_rom", "altered_pc", "non_monotonic_cycles",
            "dropped_access", "changed_register", "fabricated_provenance",
            "known_peripheral_divergence", "unavailable_field_accounting",
        ],
    }
    args.output.write_text(json.dumps(report, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
