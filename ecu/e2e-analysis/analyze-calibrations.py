#!/usr/bin/env python3
"""Resolve the full terminated pointer index and candidate Bosch descriptors."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


TABLE_ADDRESS = 0x45C0
KNOWN_INPUT_STATE_ADDRESSES = frozenset([0x04] + list(range(0x36, 0x3C)))


def load_pointers(data: bytes) -> tuple[list[dict[str, Any]], int]:
    pointers = []
    for index in range(256):
        offset = TABLE_ADDRESS + index * 2
        target = int.from_bytes(data[offset:offset + 2], "big")
        if target == 0xFFFF:
            return pointers, offset
        pointers.append({
            "index": index,
            "index_hex": f"0x{index:02x}",
            "table_address": offset,
            "table_address_hex": f"0x{offset:04x}",
            "target": target,
            "target_hex": f"0x{target:04x}",
        })
    raise ValueError("pointer index has no 0xffff terminator")


def decode_descriptor(data: bytes, target: int) -> dict[str, Any] | None:
    if (target + 2 > len(data)
            or data[target] not in KNOWN_INPUT_STATE_ADDRESSES):
        return None
    first_input_state = data[target]
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
        if cursor + cols > len(data):
            return None
        col_axis = list(data[cursor:cursor + cols])
        cursor += cols
    size = rows * cols
    if cursor + size > len(data):
        return None
    return {
        "first_input_state": first_input_state,
        "first_input_state_hex": f"INTMEM:{first_input_state:04x}",
        "rows": rows,
        "cols": cols,
        "row_axis_raw": row_axis,
        "column_axis_raw": col_axis,
        "second_input_state": 0x40 if col_axis is not None else None,
        "dimension_source": (
            "heuristic_second_input_at_INTMEM_0040"
            if col_axis is not None else "heuristic_one_dimensional"
        ),
        "payload": cursor,
        "payload_hex_address": f"0x{cursor:04x}",
        "payload_size": size,
        "payload_hex": data[cursor:cursor + size].hex(),
    }


def active_xdf_tables(xdf: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        entry for entry in xdf["entries"]
        if entry["kind"] == "table" and not entry["is_separator"]
    ]


def xdf_summary(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": entry["title"],
        "address": entry["address"],
        "address_hex": entry["address_hex"],
        "rows": entry["rows"],
        "cols": entry["cols"],
    }


def attach_calls(
    pointers: list[dict[str, Any]], callsites: list[dict[str, Any]]
) -> dict[str, Any]:
    uses: dict[int, list[dict[str, Any]]] = defaultdict(list)
    unresolved = []
    for call in callsites:
        index = call.get("r2_index")
        if index is None or not 0 <= index < len(pointers):
            unresolved.append({
                "call_address": call["call_address"],
                "function": call["function"],
            })
        else:
            uses[index].append(call)
    for pointer in pointers:
        calls = uses.get(pointer["index"], [])
        pointer["literal_r2_call_count"] = len(calls)
        pointer["literal_r2_call_addresses"] = [
            call["call_address"] for call in calls
        ]
        pointer["literal_r2_functions"] = sorted({
            call["function"] for call in calls
        })
    return {
        "resolved_literal_r2_count": sum(map(len, uses.values())),
        "unresolved_literal_r2_count": len(unresolved),
        "unresolved_literal_r2_calls": unresolved,
        "literal_r2_values": sorted(uses),
    }


def attach_descriptors(
    data: bytes,
    pointers: list[dict[str, Any]],
    xdf: dict[str, Any],
) -> list[dict[str, Any]]:
    xdf_by_address: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for entry in active_xdf_tables(xdf):
        xdf_by_address[entry["address"]].append(entry)
    by_target: dict[int, dict[str, Any]] = {}
    for pointer in pointers:
        target = pointer["target"]
        if target not in by_target:
            decoded = decode_descriptor(data, target)
            if decoded is None:
                continue
            decoded["target"] = target
            decoded["target_hex"] = f"0x{target:04x}"
            decoded["pointer_indices"] = []
            decoded["literal_r2_alias_call_count"] = 0
            decoded["literal_r2_call_addresses"] = []
            decoded["xdf_matches"] = [
                xdf_summary(entry)
                for entry in xdf_by_address.get(decoded["payload"], [])
            ]
            by_target[target] = decoded
        if target in by_target:
            descriptor = by_target[target]
            descriptor["pointer_indices"].append(pointer["index"])
            descriptor["literal_r2_alias_call_count"] += (
                pointer["literal_r2_call_count"]
            )
            descriptor["literal_r2_call_addresses"].extend(
                pointer["literal_r2_call_addresses"]
            )
            pointer["descriptor_target"] = descriptor["target_hex"]
            pointer["payload"] = descriptor["payload_hex_address"]
            pointer["xdf_titles"] = [
                entry["title"] for entry in descriptor["xdf_matches"]
            ]
    return list(by_target.values())


def classify_xdf(
    xdf: dict[str, Any], descriptors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    matched = {
        match["address"]
        for descriptor in descriptors
        for match in descriptor["xdf_matches"]
    }
    return [
        {
            **xdf_summary(entry),
            "status": (
                "exact_descriptor_payload"
                if entry["address"] in matched
                else "other_format_or_unresolved"
            ),
        }
        for entry in active_xdf_tables(xdf)
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("combined", type=Path)
    parser.add_argument("xdf_analysis", type=Path)
    parser.add_argument("callsites", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.combined.read_bytes()
    xdf = json.loads(args.xdf_analysis.read_text(encoding="utf-8"))
    calls = json.loads(args.callsites.read_text(encoding="utf-8"))
    pointers, terminator = load_pointers(data)
    usage = attach_calls(pointers, calls["callsites"])
    descriptors = attach_descriptors(data, pointers, xdf)
    targets = Counter(pointer["target"] for pointer in pointers)
    xdf_tables = classify_xdf(xdf, descriptors)
    report = {
        "table_address": TABLE_ADDRESS,
        "table_address_hex": f"0x{TABLE_ADDRESS:04x}",
        "terminator_address": terminator,
        "terminator_address_hex": f"0x{terminator:04x}",
        "pointer_count": len(pointers),
        "unique_target_count": len(targets),
        "duplicate_targets": {
            f"0x{target:04x}": count
            for target, count in targets.items() if count > 1
        },
        "decoded_descriptor_count": len(descriptors),
        **usage,
        "pointers": pointers,
        "descriptors": descriptors,
        "xdf_table_count": len(xdf_tables),
        "xdf_exact_descriptor_payload_count": sum(
            table["status"] == "exact_descriptor_payload"
            for table in xdf_tables
        ),
        "xdf_tables": xdf_tables,
    }
    args.output.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
