#!/usr/bin/env python3
"""Summarize vector and SAB80C515 peripheral evidence."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict, deque
from pathlib import Path
from typing import Any


VECTORS = {
    "CODE:0000": ("reset", "reset"),
    "CODE:0003": ("external_0", "external interrupt 0"),
    "CODE:000b": ("timer_0", "timer 0 overflow"),
    "CODE:0013": ("external_1", "external interrupt 1"),
    "CODE:001b": ("timer_1", "timer 1 overflow"),
    "CODE:0023": ("serial", "UART receive/transmit"),
    "CODE:002b": ("timer_2", "timer 2 overflow"),
    "CODE:0043": ("adc", "ADC completion"),
    "CODE:004b": ("external_2", "external interrupt 2"),
    "CODE:0053": ("external_3", "external interrupt 3"),
    "CODE:005b": ("external_4", "external interrupt 4"),
    "CODE:0063": ("external_5", "external interrupt 5"),
    "CODE:006b": ("external_6", "external interrupt 6"),
}
SFRS = {
    0x80: ("P0", "port"), 0x81: ("SP", "core"),
    0x82: ("DPL", "core"), 0x83: ("DPH", "core"),
    0x86: ("WDTREL", "watchdog"), 0x87: ("PCON", "core"),
    0x88: ("TCON", "timer"), 0x89: ("TMOD", "timer"),
    0x8A: ("TL0", "timer"), 0x8B: ("TL1", "timer"),
    0x8C: ("TH0", "timer"), 0x8D: ("TH1", "timer"),
    0x90: ("P1", "port"), 0x98: ("SCON", "serial"),
    0x99: ("SBUF", "serial"), 0xA0: ("P2", "port/xram_page"),
    0xA8: ("IEN0", "interrupt"), 0xA9: ("IP0", "interrupt"),
    0xB0: ("P3", "port"), 0xB8: ("IEN1", "interrupt"),
    0xB9: ("IP1", "interrupt"), 0xC0: ("IRCON", "interrupt"),
    0xC1: ("CCEN", "compare_capture"), 0xC2: ("CCL1", "compare_capture"),
    0xC3: ("CCH1", "compare_capture"), 0xC4: ("CCL2", "compare_capture"),
    0xC5: ("CCH2", "compare_capture"), 0xC6: ("CCL3", "compare_capture"),
    0xC7: ("CCH3", "compare_capture"), 0xC8: ("T2CON", "timer2"),
    0xCA: ("CRCL", "compare_capture"), 0xCB: ("CRCH", "compare_capture"),
    0xCC: ("TL2", "timer2"), 0xCD: ("TH2", "timer2"),
    0xD0: ("PSW", "core"), 0xD8: ("ADCON0", "adc"),
    0xD9: ("ADDAT", "adc"), 0xDA: ("DAPR", "adc"),
    0xDB: ("P6", "adc_input_port"), 0xE0: ("ACC", "core"),
    0xE8: ("P4", "port"), 0xF0: ("B", "core"),
    0xF8: ("P5", "port"),
}
LOGICAL_ENDPOINTS = [
    {
        "name": "crank_capture_input",
        "endpoint": "external-3/CC0",
        "functions": ["CODE:20a0", "CODE:2462", "CODE:21d8"],
        "confidence": "high logical; medium physical",
    },
    {
        "name": "ignition_coil_drive",
        "endpoint": "P1.5 toggled by Timer 0",
        "functions": ["CODE:2010", "CODE:21d8", "CODE:27cc"],
        "confidence": "high logical; medium-high physical",
    },
    {
        "name": "injector_bank_a_drive",
        "endpoint": "CC2/P1.2",
        "functions": ["CODE:21d8", "CODE:2fd3"],
        "confidence": "high logical; medium-high physical",
    },
    {
        "name": "injector_bank_b_drive",
        "endpoint": "CC3/P1.3",
        "functions": ["CODE:21d8", "CODE:2fd3"],
        "confidence": "high logical; medium-high physical",
    },
    {
        "name": "iac_valve_drive",
        "endpoint": "P1.7 toggled by Timer 1",
        "functions": ["CODE:257d", "CODE:6bb7", "CODE:6db6"],
        "confidence": "high logical; medium-high physical",
    },
    {
        "name": "discrete_output_latch",
        "endpoint": "INTMEM:0022 -> EXTMEM:a040",
        "functions": ["CODE:61b3"],
        "confidence": "high logical; unknown relay identities",
    },
]


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def graph(functions: list[dict[str, Any]]) -> dict[str, set[str]]:
    entries = {function["entry"] for function in functions}
    result = {entry: set() for entry in entries}
    for function in functions:
        for reference in function["references"]:
            if reference["flow"] and reference["to"] in entries:
                result[function["entry"]].add(reference["to"])
    return result


def short_chain(root: str, edges: dict[str, set[str]]) -> list[str]:
    seen = set()
    queue = deque([(root, 0)])
    while queue:
        entry, depth = queue.popleft()
        if entry in seen or depth > 3:
            continue
        seen.add(entry)
        for child in edges.get(entry, set()):
            queue.append((child, depth + 1))
    return sorted(seen)


def vector_records(functions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    edges = graph(functions)
    by_entry = {function["entry"]: function for function in functions}
    result = []
    for address, (name, manual_role) in VECTORS.items():
        function = by_entry.get(address)
        targets = sorted(edges.get(address, set()))
        result.append({
            "vector": address,
            "name": name,
            "manufacturer_role": manual_role,
            "firmware_name": function["name"] if function else None,
            "direct_targets": targets,
            "wrapper_instructions": {
                target: [
                    {
                        "address": instruction["address"],
                        "text": instruction["text"],
                    }
                    for instruction in by_entry[target]["instructions"]
                ]
                for target in targets if target in by_entry
            },
            "worker_chain_depth_3": short_chain(address, edges),
            "confidence": "high",
        })
    return result


def peripheral_records(
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    accesses: dict[int, dict[str, Any]] = {}
    for function in functions:
        for reference in function["references"]:
            if reference["space"] != "SFR":
                continue
            value = int(reference["to"].split(":")[1], 16)
            record = accesses.setdefault(value, {
                "address": reference["to"],
                "readers": set(),
                "writers": set(),
                "evidence": [],
            })
            if reference["read"]:
                record["readers"].add(function["entry"])
            if reference["write"]:
                record["writers"].add(function["entry"])
            record["evidence"].append({
                "instruction": reference["from"],
                "function": function["entry"],
                "access": reference["type"],
            })
    result = []
    for value, record in sorted(accesses.items()):
        name, group = SFRS.get(value, (f"SFR_{value:02x}", "unknown"))
        record.update({
            "name": name,
            "manufacturer_group": group,
            "readers": sorted(record["readers"]),
            "writers": sorted(record["writers"]),
            "firmware_proof": (
                "peripheral register access; physical ECU endpoint not proven"
            ),
        })
        result.append(record)
    return result


def group_functions(
    peripherals: list[dict[str, Any]],
) -> dict[str, list[str]]:
    groups: dict[str, set[str]] = defaultdict(set)
    for peripheral in peripherals:
        groups[peripheral["manufacturer_group"]].update(
            peripheral["readers"] + peripheral["writers"]
        )
    return {
        group: sorted(functions)
        for group, functions in sorted(groups.items())
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("program_model", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    program = load(args.program_model)
    peripherals = peripheral_records(program["functions"])
    report = {
        "vectors": vector_records(program["functions"]),
        "peripheral_count": len(peripherals),
        "peripherals": peripherals,
        "functions_by_manufacturer_peripheral_group":
            group_functions(peripherals),
        "logical_endpoints": LOGICAL_ENDPOINTS,
        "confidence_boundary": (
            "Vector and SFR roles come from the SAB80C515 architecture. "
            "Injector/coil/IAC/relay assignments require ECU wiring evidence."
        ),
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
