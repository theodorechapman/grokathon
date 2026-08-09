"""Attach selector-dependent consumers and descriptor variants."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from lookup_configuration import MASTER_BASE, MASTER_END


def attach_consumers(
    calibration: dict[str, Any],
    dataflow: dict[str, Any],
    tables: list[dict[str, Any]],
) -> None:
    by_slot: dict[int, list[dict[str, Any]]] = defaultdict(list)
    master_tables = [
        table for table in tables
        if MASTER_BASE <= table["pointer_base"] < MASTER_END
    ]
    mappings = {
        (table["selector_base"], item["logical_index"]): item
        for table in master_tables
        for item in table["slots"]
    }
    dynamic = []
    for call_address, call in dataflow["calls"].items():
        indices = call["possible_indices"]
        if indices is None:
            dynamic.append({
                "call_address": call_address,
                "function": call["function"],
                "dependency": call.get("unresolved_dependency"),
            })
            continue
        selector_bases = {table["selector_base"] for table in master_tables}
        for selector_base in selector_bases:
            for index in indices:
                mapping = mappings.get((selector_base, index))
                if (mapping is None or mapping["status"] != "mapped"
                        or "absolute_master_slot" not in mapping):
                    continue
                by_slot[mapping["absolute_master_slot"]].append({
                    "call_address": call_address,
                    "function": call["function"],
                    "logical_r2_set": indices,
                    "selector_base": f"0x{selector_base:04x}",
                    "selector": mapping["selector_hex"],
                    "interpolate_second_dimension":
                        mapping["interpolate_second_dimension"],
                })
    for pointer in calibration["pointers"]:
        pointer["consumers"] = by_slot.get(pointer["index"], [])
        pointer["usage_status"] = (
            "configuration_dependent_static_consumer"
            if pointer["consumers"]
            else "not_observed_for_recovered_selector_configs"
        )
    calibration["lookup_usage"] = {
        "resolved_call_count": dataflow["resolved_set_count"],
        "dynamic_call_count": len(dynamic),
        "master_slots_with_candidate_consumers": sorted(by_slot),
        "unresolved_calls": dynamic,
        "caveat": (
            "Consumers are candidates across recovered selector-table "
            "configurations; control-flow context is required to choose one."
        ),
    }


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
    row_axis = list(data[cursor:cursor + rows])
    cursor += rows
    second_state = None
    cols = 1
    column_axis = None
    if two_dimensional:
        if cursor + 2 > len(data):
            return None
        second_state = data[cursor]
        cols = data[cursor + 1]
        cursor += 2
        if cols == 0 or cursor + cols > len(data):
            return None
        column_axis = list(data[cursor:cursor + cols])
        cursor += cols
    size = rows * cols
    if cursor + size > len(data):
        return None
    return {
        "target": target,
        "target_hex": f"0x{target:04x}",
        "first_input_state": first_state,
        "first_input_state_hex": f"INTMEM:{first_state:04x}",
        "rows": rows,
        "row_axis_deltas": row_axis,
        "second_input_state": second_state,
        "second_input_state_hex": (
            f"INTMEM:{second_state:04x}"
            if second_state is not None else None
        ),
        "cols": cols,
        "column_axis_deltas": column_axis,
        "payload": cursor,
        "payload_hex_address": f"0x{cursor:04x}",
        "payload_size": size,
        "payload_hex": data[cursor:cursor + size].hex(),
        "dimension_source": "selector_bit_0",
    }


def enrich_descriptors(
    data: bytes,
    calibration: dict[str, Any],
    tables: list[dict[str, Any]],
) -> None:
    dimensions: dict[int, set[bool]] = defaultdict(set)
    for table in tables:
        for item in table["slots"]:
            if ("absolute_master_slot" in item
                    and item["status"] == "mapped"):
                dimensions[item["absolute_master_slot"]].add(
                    item["interpolate_second_dimension"]
                )
    xdf_by_address = {
        entry["address"]: entry
        for entry in calibration["xdf_tables"]
    }
    by_target = {
        descriptor["target"]: descriptor
        for descriptor in calibration["descriptors"]
    }
    corrected = []
    for pointer in calibration["pointers"]:
        flags = sorted(dimensions.get(pointer["index"], set()))
        pointer["selector_dimension_flags"] = flags
        variants = [
            decode_descriptor(data, pointer["target"], flag)
            for flag in flags
        ]
        variants = [variant for variant in variants if variant is not None]
        if not variants and pointer["target"] in by_target:
            variants = [by_target[pointer["target"]]]
        pointer["descriptor_variants"] = [{
            "rows": variant["rows"],
            "cols": variant["cols"],
            "payload": variant["payload_hex_address"],
        } for variant in variants]
        for variant in variants:
            variant["pointer_index"] = pointer["index"]
            variant["xdf_match"] = xdf_by_address.get(variant["payload"])
            corrected.append(variant)
    calibration["selector_decoded_descriptors"] = corrected
    calibration["selector_decoded_descriptor_count"] = len(corrected)
