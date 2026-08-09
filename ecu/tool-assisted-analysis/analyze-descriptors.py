#!/usr/bin/env python3
"""Decode Bosch 0x3B/0x40 calibration descriptors from the pointer index."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DESCRIPTOR_TYPES = frozenset([0x04] + list(range(0x36, 0x3C)))


def decode_descriptor(data: bytes, target: int) -> dict[str, Any] | None:
    if target + 2 > len(data) or data[target] not in DESCRIPTOR_TYPES:
        return None
    descriptor_type = data[target]
    rows = data[target + 1]
    cursor = target + 2
    if rows == 0 or cursor + rows > len(data):
        return None
    row_axis = list(data[cursor:cursor + rows])
    cursor += rows
    cols = 1
    col_axis = None
    if (cursor + 2 <= len(data) and data[cursor] == 0x40
            and 0 < data[cursor + 1] <= 32):
        cols = data[cursor + 1]
        cursor += 2
        if cols == 0 or cursor + cols > len(data):
            return None
        col_axis = list(data[cursor:cursor + cols])
        cursor += cols
    payload_size = rows * cols
    return {
        "descriptor_type": descriptor_type,
        "descriptor_type_hex": f"0x{descriptor_type:02x}",
        "target": target,
        "target_hex": f"0x{target:04x}",
        "rows": rows,
        "cols": cols,
        "row_axis_raw": row_axis,
        "col_axis_raw": col_axis,
        "payload_address": cursor,
        "payload_address_hex": f"0x{cursor:04x}",
        "payload_size": payload_size,
        "payload_end": cursor + payload_size,
        "payload_hex": data[cursor:cursor + payload_size].hex(),
    }


def summarize_xdf(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": entry["title"],
        "address": entry["address"],
        "address_hex": entry["address_hex"],
        "rows": entry["rows"],
        "cols": entry["cols"],
    }


def attach_xdf_matches(
    descriptors: list[dict[str, Any]], entries: list[dict[str, Any]]
) -> dict[str, Any]:
    active_tables = [
        entry for entry in entries
        if entry["kind"] == "table" and not entry["is_separator"]
    ]
    by_address: dict[int, list[dict[str, Any]]] = {}
    for entry in active_tables:
        by_address.setdefault(entry["address"], []).append(entry)
    exact_count = 0
    dimension_mismatches = []
    orientation_differences = []
    for descriptor in descriptors:
        matches = by_address.get(descriptor["payload_address"], [])
        descriptor["xdf_matches"] = [summarize_xdf(entry) for entry in matches]
        if matches:
            exact_count += 1
        for entry in matches:
            xdf_dimensions = (entry["rows"], entry["cols"])
            descriptor_dimensions = (
                descriptor["rows"], descriptor["cols"]
            )
            if xdf_dimensions != descriptor_dimensions:
                difference = {
                    "title": entry["title"],
                    "descriptor_target": descriptor["target_hex"],
                    "descriptor_dimensions": list(descriptor_dimensions),
                    "xdf_dimensions": list(xdf_dimensions),
                }
                if (entry["rows"] * entry["cols"] == descriptor["payload_size"]
                        and 1 in xdf_dimensions
                        and 1 in descriptor_dimensions):
                    orientation_differences.append(difference)
                else:
                    dimension_mismatches.append(difference)
    matched_addresses = {
        descriptor["payload_address"] for descriptor in descriptors
        if descriptor["xdf_matches"]
    }
    missing = [
        summarize_xdf(entry) for entry in active_tables
        if entry["address"] not in matched_addresses
    ]
    return {
        "exact_descriptor_match_count": exact_count,
        "dimension_mismatches": dimension_mismatches,
        "one_dimensional_orientation_differences": orientation_differences,
        "xdf_tables_without_exact_descriptor": missing,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    parser.add_argument("xdf_analysis", type=Path)
    parser.add_argument("map_usage", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.binary.read_bytes()
    xdf = json.loads(args.xdf_analysis.read_text())
    usage = json.loads(args.map_usage.read_text())
    descriptors = []
    seen = set()
    for pointer in usage["pointers"]:
        target = pointer["target"]
        if target in seen:
            continue
        seen.add(target)
        descriptor = decode_descriptor(data, target)
        if descriptor is not None:
            descriptor["pointer_indices"] = [
                item["index"] for item in usage["pointers"]
                if item["target"] == target
            ]
            descriptor["immediate_call_count"] = sum(
                item["immediate_call_count"] for item in usage["pointers"]
                if item["target"] == target
            )
            descriptors.append(descriptor)
    matches = attach_xdf_matches(descriptors, xdf["entries"])
    report = {
        "format": {
            "descriptor_types": [f"0x{value:02x}" for value in sorted(
                DESCRIPTOR_TYPES
            )],
            "column_marker": "0x40",
            "layout": "type rows row_axis [40 cols col_axis] payload",
        },
        "decoded_descriptor_count": len(descriptors),
        **matches,
        "descriptors": descriptors,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
