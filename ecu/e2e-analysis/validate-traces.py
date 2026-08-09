#!/usr/bin/env python3
"""Independently validate structural lookup behavior in emulator traces."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


EXPECTED_RESET = [
    "CODE:0000", "CODE:0073", "CODE:0075", "CODE:0077",
    "CODE:0079", "CODE:007b", "CODE:20e0", "CODE:5c00",
]


def decode_descriptor(
    data: bytes, target: int, two_dimensional: bool
) -> dict[str, Any] | None:
    if target + 2 > len(data):
        return None
    first_state = data[target]
    rows = data[target + 1]
    cursor = target + 2
    if rows == 0 or cursor + rows > len(data):
        return None
    cursor += rows
    second_state = None
    cols = 1
    if two_dimensional:
        if cursor + 2 > len(data):
            return None
        second_state = data[cursor]
        cols = data[cursor + 1]
        cursor += 2
        if cols == 0 or cursor + cols > len(data):
            return None
        cursor += cols
    payload_size = rows * cols
    if cursor + payload_size > len(data):
        return None
    return {
        "first_state": f"INTMEM:{first_state:04x}",
        "second_state": (
            f"INTMEM:{second_state:04x}"
            if second_state is not None else None
        ),
        "rows": rows,
        "cols": cols,
        "payload": f"CODE:{cursor:04x}",
        "payload_size": payload_size,
    }


def validate_lookup(data: bytes, trace: dict[str, Any]) -> dict[str, Any]:
    errors = []
    index = trace["logical_index"]
    selector_base = int(trace["selector_base"].split(":")[1], 16)
    pointer_base = int(trace["pointer_base"].split(":")[1], 16)
    selector = data[selector_base + index]
    visited = set(trace["visited_addresses"])
    if not trace["completed_at_ret"]:
        errors.append("did_not_reach_CODE_0469")
    if not 0 <= trace["result_acc"] <= 0xFF:
        errors.append("result_outside_byte_range")
    if "CODE:040f" not in visited:
        errors.append("missing_R2_increment")
    result = {
        "logical_index": index,
        "synthetic_input": trace["synthetic_input"],
        "selector": f"0x{selector:02x}",
    }
    if selector == 0xFF:
        if trace["terminator_bit"] != 1:
            errors.append("terminator_bit_not_set")
        if "CODE:0416" not in visited or "CODE:046a" in visited:
            errors.append("wrong_terminator_path")
        result["classification"] = "terminator"
    else:
        if trace["terminator_bit"] != 0:
            errors.append("terminator_bit_set_for_mapping")
        if "CODE:041a" not in visited or "CODE:046a" not in visited:
            errors.append("wrong_mapped_path")
        two_dimensional = bool(selector & 1)
        required_branch = "CODE:0437" if two_dimensional else "CODE:0431"
        if required_branch not in visited:
            errors.append("wrong_dimension_path")
        pointer_address = pointer_base + (selector & 0xFE)
        target = int.from_bytes(
            data[pointer_address:pointer_address + 2], "big"
        )
        result.update({
            "classification": (
                "two_axis" if two_dimensional else "one_axis"
            ),
            "pointer_address": f"CODE:{pointer_address:04x}",
            "target": f"CODE:{target:04x}",
            "descriptor": decode_descriptor(
                data, target, two_dimensional
            ),
        })
        if result["descriptor"] is None:
            errors.append("independent_descriptor_decode_failed")
    result["passed"] = not errors
    result["errors"] = errors
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("combined", type=Path)
    parser.add_argument("traces", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.combined.read_bytes()
    traces = json.loads(args.traces.read_text(encoding="utf-8"))
    reset_actual = [step["pc"] for step in traces["reset_trace"]]
    results = [
        validate_lookup(data, trace)
        for trace in traces["lookup_traces"]
    ]
    failures = [result for result in results if not result["passed"]]
    report = {
        "reset": {
            "passed": reset_actual == EXPECTED_RESET,
            "expected": EXPECTED_RESET,
            "actual": reset_actual,
        },
        "lookup_trace_count": len(results),
        "lookup_pass_count": len(results) - len(failures),
        "lookup_failure_count": len(failures),
        "independent_check": (
            "Raw selector/pointer/descriptor bytes and expected control-flow "
            "branches are decoded without using Ghidra's decompiler."
        ),
        "failures": failures,
        "results": results,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    if failures or reset_actual != EXPECTED_RESET:
        raise SystemExit("trace validation failed")


if __name__ == "__main__":
    main()
