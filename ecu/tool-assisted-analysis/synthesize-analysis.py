#!/usr/bin/env python3
"""Combine XDF, descriptor, lookup, checksum, and Ghidra evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def descriptor_summary(descriptor: dict[str, Any]) -> dict[str, Any]:
    return {
        "pointer_indices": descriptor["pointer_indices"],
        "target": descriptor["target_hex"],
        "type": descriptor["descriptor_type_hex"],
        "dimensions": [descriptor["rows"], descriptor["cols"]],
        "payload_address": descriptor["payload_address_hex"],
        "immediate_call_count": descriptor["immediate_call_count"],
        "xdf_titles": [
            match["title"] for match in descriptor["xdf_matches"]
        ],
    }


def pointer_summary(pointer: dict[str, Any]) -> dict[str, Any]:
    return {
        "index": pointer["index"],
        "target": pointer["target_hex"],
        "immediate_call_count": pointer["immediate_call_count"],
        "call_addresses": pointer["call_addresses"],
        "functions": pointer["functions"],
    }


def rev_limit_report(
    xdf: dict[str, Any], ghidra: dict[str, Any] | None, data: bytes
) -> dict[str, Any]:
    constants = [
        {
            "title": entry["title"],
            "address": entry["address_hex"],
            "raw_hex": entry["raw_hex"],
            "value": entry["values"][0],
            "equation": entry["equation"],
        }
        for entry in xdf["entries"]
        if entry["kind"] == "constant" and "Rev Limit" in entry["title"]
    ]
    touching_functions = []
    if ghidra is not None:
        for function in ghidra["functions"]:
            relevant = [
                ref for ref in function["calibration_refs"]
                if 0x42D0 <= int(ref.split(":")[1], 16) <= 0x4315
            ]
            if relevant:
                touching_functions.append({
                    "entry": function["entry"],
                    "name": function["name"],
                    "references": relevant,
                })
    primary_base = 0x42D0
    secondary_base = 0x430E
    common = 0
    while (secondary_base + common < len(data)
           and data[primary_base + common] == data[secondary_base + common]):
        common += 1
    return {
        "xdf_constants": constants,
        "primary_record_base": f"0x{primary_base:04x}",
        "secondary_record_base": f"0x{secondary_base:04x}",
        "identical_record_prefix_bytes": common,
        "identical_record_prefix_hex": data[
            primary_base:primary_base + common
        ].hex(),
        "direct_dptr_loads_of_primary_base": [
            f"0x{offset:04x}" for offset in range(len(data) - 2)
            if data[offset:offset + 3] == b"\x90\x42\xd0"
        ],
        "functions_with_direct_nearby_references": touching_functions,
        "interpretation": (
            "External code directly loads the primary record base and copies "
            "only offsets 0..2. No external byte-exact reference reaches the "
            "limit bytes at offsets 5..6. Their runtime consumer may be in "
            "the undumped internal ROM; the XDF names remain plausible but "
            "not fully code-proven."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xdf", type=Path, required=True)
    parser.add_argument("--descriptors", type=Path, required=True)
    parser.add_argument("--usage", type=Path, required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--ghidra", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    xdf = load(args.xdf)
    descriptors = load(args.descriptors)
    usage = load(args.usage)
    data = args.binary.read_bytes()
    ghidra = load(args.ghidra) if args.ghidra and args.ghidra.exists() else None
    matched_titles = sorted({
        match["title"]
        for descriptor in descriptors["descriptors"]
        for match in descriptor["xdf_matches"]
    })
    used_descriptors = [
        descriptor_summary(descriptor)
        for descriptor in descriptors["descriptors"]
        if descriptor["immediate_call_count"]
    ]
    top_pointers = sorted(
        usage["pointers"],
        key=lambda pointer: pointer["immediate_call_count"],
        reverse=True,
    )
    checksum_entries = [
        entry for entry in xdf["entries"]
        if entry["kind"] == "constant" and "Checksum" in entry["title"]
    ]
    calibration_functions = [] if ghidra is None else [
        {
            "entry": function["entry"],
            "name": function["name"],
            "references": function["calibration_refs"],
        }
        for function in ghidra["functions"] if function["calibration_refs"]
    ]
    report = {
        "identity": {
            "path": str(args.binary),
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "dme": data[0x1F02:0x1F0C].decode()[::-1],
            "software": data[0x1F0C:0x1F16].decode()[::-1],
        },
        "checksum": {
            "xdf_claims": [
                {
                    "address": entry["address_hex"],
                    "raw_hex": entry["raw_hex"],
                    "value": entry["values"][0],
                }
                for entry in checksum_entries
            ],
            "metadata_word_at_0x1f00": int.from_bytes(
                data[0x1F00:0x1F02], "big"
            ),
            "assessment": (
                "The XDF address 0x7ffd contains erased 0xffff bytes and is "
                "not a credible stored checksum in this image. The 0x7f2f "
                "word at 0x1f00 precedes the DME/software identifiers and is "
                "a stronger checksum candidate, but its algorithm is not "
                "proven by the dumped external code."
            ),
        },
        "xdf": {
            "title": xdf["header"]["DefTitle"],
            "active_entry_count": xdf["active_entry_count"],
            "issue_count": len(xdf["issues"]),
            "issues": xdf["issues"],
        },
        "calibration_descriptors": {
            "decoded_unique_count": descriptors["decoded_descriptor_count"],
            "matched_xdf_title_count": len(matched_titles),
            "matched_xdf_titles": matched_titles,
            "true_dimension_mismatches": descriptors["dimension_mismatches"],
            "one_dimensional_orientation_differences": descriptors[
                "one_dimensional_orientation_differences"
            ],
            "xdf_tables_without_exact_descriptor": descriptors[
                "xdf_tables_without_exact_descriptor"
            ],
            "used_descriptors": used_descriptors,
        },
        "master_lookup": {
            "service": usage["master_lookup"],
            "pointer_count": usage["pointer_count"],
            "unique_target_count": usage["unique_target_count"],
            "resolved_immediate_calls": usage["resolved_call_count"],
            "dynamic_or_unresolved_calls": usage["unresolved_call_count"],
            "used_immediate_indices": usage["used_indices"],
            "top_used_indices": [
                pointer_summary(pointer) for pointer in top_pointers[:10]
                if pointer["immediate_call_count"]
            ],
            "unresolved_calls": usage["unresolved_calls"],
        },
        "rev_limit": rev_limit_report(xdf, ghidra, data),
        "ghidra": None if ghidra is None else {
            "language": ghidra["language"],
            "memory_blocks": ghidra["memory_blocks"],
            "function_count": ghidra["function_count"],
            "decompiled_function_count": len(ghidra["decompiled"]),
            "functions_with_calibration_references": calibration_functions,
            "function_count_with_sfr_references": sum(
                bool(function["sfr_refs"]) for function in ghidra["functions"]
            ),
        },
    }
    args.output.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
