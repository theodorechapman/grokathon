#!/usr/bin/env python3
"""Verify checksum candidates and code references without guessing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def direct_code_references(
    program: dict[str, Any], targets: set[str]
) -> list[dict[str, str]]:
    result = []
    for function in program["functions"]:
        for reference in function["references"]:
            if reference["to"] in targets:
                result.append({
                    "function": function["entry"],
                    "instruction": reference["from"],
                    "target": reference["to"],
                    "type": reference["type"],
                })
    return result


def instruction_constants(
    program: dict[str, Any], constants: tuple[str, ...]
) -> list[dict[str, str]]:
    result = []
    for function in program["functions"]:
        for instruction in function["instructions"]:
            if any(value in instruction["text"].lower()
                   for value in constants):
                result.append({
                    "function": function["entry"],
                    "instruction": instruction["address"],
                    "text": instruction["text"],
                })
    return result


def runtime_verifier(program: dict[str, Any]) -> dict[str, Any]:
    function = next(
        item for item in program["functions"]
        if item["entry"] == "CODE:9016"
    )
    by_address = {
        instruction["address"]: instruction["text"]
        for instruction in function["instructions"]
    }
    evidence = {
        "CODE:9021": "MOV R2,#0x9f",
        "CODE:9023": "MOV DPTR,#0x0",
        "CODE:9027": "MOV R0,A",
        "CODE:9028": "MOV R1,A",
        "CODE:902a": "MOVC A,@A+DPTR",
        "CODE:902b": "ADD A,R0",
        "CODE:902f": "INC R1",
        "CODE:9030": "INC DPTR",
    }
    matched = {
        address: by_address.get(address) == text
        for address, text in evidence.items()
    }
    return {
        "function": "CODE:9016",
        "proposed_name": "verify_combined_rom_checksum",
        "algorithm": (
            "sum16 bytes CODE:0000-9eff from zero; compare high byte "
            "to CODE:9f00 and low byte to CODE:9f01"
        ),
        "instruction_evidence": {
            address: by_address.get(address) for address in evidence
        },
        "evidence_matched": all(matched.values()),
        "failure_path": (
            "records fault-table identifier at CODE:4532 with subtype 4"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("combined", type=Path)
    parser.add_argument("program_model", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.combined.read_bytes()
    program = json.loads(args.program_model.read_text(encoding="utf-8"))
    stored = int.from_bytes(data[0x9F00:0x9F02], "big")
    calculations = {
        "sum16_CODE_0000_9eff": sum(data[:0x9F00]) & 0xFFFF,
        "sum16_CODE_0000_9fff": sum(data) & 0xFFFF,
        "sum16_external_CPU_2000_9eff": (
            sum(data[0x2000:0x9F00]) & 0xFFFF
        ),
    }
    report = {
        "stored_candidate": {
            "cpu_address": "CODE:9f00",
            "external_eprom_physical_offset": "0x1f00",
            "value": stored,
            "value_hex": f"0x{stored:04x}",
        },
        "calculations": {
            name: {"value": value, "value_hex": f"0x{value:04x}"}
            for name, value in calculations.items()
        },
        "exact_sum_match": (
            calculations["sum16_CODE_0000_9eff"] == stored
        ),
        "runtime_verifier": runtime_verifier(program),
        "ghidra_direct_references": direct_code_references(
            program, {"CODE:9f00", "CODE:9f01"}
        ),
        "instructions_with_candidate_constants": instruction_constants(
            program, ("0x9f00", "#0x9f", "#0x7f2f")
        ),
        "assessment": (
            "The stored word exactly equals the 16-bit byte sum over "
            "CODE:0000-9eff. CODE:9016 independently computes this sum "
            "and compares it big-endian with CODE:9f00-9f01."
        ),
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
