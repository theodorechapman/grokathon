#!/usr/bin/env python3
"""Resolve Ghidra-observed lookup indices through the master map table."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


TABLE_ADDRESS = 0x45C0


def nearest_entries(
    target: int, entries: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    active = [entry for entry in entries if not entry["is_separator"]]
    before = [entry for entry in active if entry["address"] <= target]
    after = [entry for entry in active if entry["address"] >= target]
    return (
        max(before, key=lambda item: item["address"]) if before else None,
        min(after, key=lambda item: item["address"]) if after else None,
    )


def entry_summary(entry: dict[str, Any] | None, target: int) -> dict[str, Any] | None:
    if entry is None:
        return None
    return {
        "title": entry["title"],
        "address": entry["address"],
        "address_hex": entry["address_hex"],
        "distance": entry["address"] - target,
    }


def load_pointers(data: bytes, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pointers = []
    for index in range(256):
        offset = TABLE_ADDRESS + index * 2
        target = int.from_bytes(data[offset:offset + 2], "big")
        if target == 0xFFFF:
            return pointers
        before, after = nearest_entries(target, entries)
        pointers.append({
            "index": index,
            "index_hex": f"0x{index:02x}",
            "table_offset": offset,
            "table_offset_hex": f"0x{offset:04x}",
            "target": target,
            "target_hex": f"0x{target:04x}",
            "target_bytes": data[target:target + 16].hex(),
            "nearest_xdf_before": entry_summary(before, target),
            "nearest_xdf_after": entry_summary(after, target),
        })
    raise ValueError("pointer index has no 0xffff terminator")


def attach_usage(
    pointers: list[dict[str, Any]], callsites: list[dict[str, Any]]
) -> dict[str, Any]:
    by_index: dict[int, list[dict[str, Any]]] = defaultdict(list)
    unresolved = []
    for callsite in callsites:
        index = callsite.get("r2_index")
        if index is None or not 0 <= index < len(pointers):
            unresolved.append({
                "call_address": callsite["call_address"],
                "function": callsite["function"],
            })
            continue
        by_index[index].append(callsite)
    for pointer in pointers:
        uses = by_index.get(pointer["index"], [])
        pointer["immediate_call_count"] = len(uses)
        pointer["call_addresses"] = [item["call_address"] for item in uses]
        pointer["functions"] = sorted({
            item["function"] for item in uses if item["function"] is not None
        })
    return {
        "resolved_call_count": sum(map(len, by_index.values())),
        "unresolved_call_count": len(unresolved),
        "unresolved_calls": unresolved,
        "used_indices": sorted(by_index),
    }


def xdf_pointer_links(
    pointers: list[dict[str, Any]], entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    links = []
    active = [entry for entry in entries
              if not entry["is_separator"] and entry["address"] < 0x6000]
    for entry in active:
        candidates = [pointer for pointer in pointers
                      if pointer["target"] <= entry["address"]]
        if not candidates:
            continue
        pointer = max(candidates, key=lambda item: item["target"])
        distance = entry["address"] - pointer["target"]
        if distance <= 0x40:
            links.append({
                "title": entry["title"],
                "xdf_address": entry["address"],
                "xdf_address_hex": entry["address_hex"],
                "pointer_index": pointer["index"],
                "pointer_target": pointer["target"],
                "pointer_target_hex": pointer["target_hex"],
                "payload_offset": distance,
                "immediate_call_count": pointer["immediate_call_count"],
                "functions": pointer["functions"],
            })
    return links


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    parser.add_argument("xdf_analysis", type=Path)
    parser.add_argument("callsites", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.binary.read_bytes()
    xdf = json.loads(args.xdf_analysis.read_text())
    callsite_report = json.loads(args.callsites.read_text())
    pointers = load_pointers(data, xdf["entries"])
    usage = attach_usage(pointers, callsite_report["callsites"])
    target_counts = Counter(pointer["target"] for pointer in pointers)
    report = {
        "master_lookup": callsite_report["master_lookup"],
        "table_address": TABLE_ADDRESS,
        "table_address_hex": f"0x{TABLE_ADDRESS:04x}",
        "pointer_count": len(pointers),
        "unique_target_count": len(target_counts),
        "duplicate_targets": {
            f"0x{target:04x}": count for target, count in target_counts.items()
            if count > 1
        },
        **usage,
        "pointers": pointers,
    }
    report["xdf_pointer_links"] = xdf_pointer_links(pointers, xdf["entries"])
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
