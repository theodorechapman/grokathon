"""Recover configuration setters and selector-table mappings."""

from __future__ import annotations

import itertools
from collections import defaultdict
from typing import Any


CONFIG_BYTES = ("0x73", "0x74", "0x75", "0x76")
MASTER_BASE = 0x45C0
MASTER_END = 0x46EC


def immediate_value(operand: str) -> int | None:
    if not operand.startswith("#0x"):
        return None
    return int(operand[1:], 16)


def collect_configurations(
    functions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    complete = []
    partial = []
    for function in functions:
        writes: dict[str, set[int]] = defaultdict(set)
        evidence: dict[str, list[str]] = defaultdict(list)
        for instruction in function["instructions"]:
            operands = instruction["operands"]
            if (instruction["mnemonic"] != "MOV" or len(operands) != 2
                    or operands[0] not in CONFIG_BYTES):
                continue
            value = immediate_value(operands[1])
            if value is not None:
                writes[operands[0]].add(value)
                evidence[operands[0]].append(instruction["address"])
        if not writes:
            continue
        base = {
            "function": function["entry"],
            "function_name": function["name"],
            "writes": {
                address: sorted(values)
                for address, values in sorted(writes.items())
            },
            "evidence": dict(evidence),
        }
        if all(address in writes for address in CONFIG_BYTES):
            value_sets = (writes[address] for address in CONFIG_BYTES)
            for values in itertools.product(*value_sets):
                pointer_base = values[0] << 8 | values[1]
                selector_base = values[2] << 8 | values[3]
                complete.append({
                    **base,
                    "pointer_base": pointer_base,
                    "pointer_base_hex": f"0x{pointer_base:04x}",
                    "selector_base": selector_base,
                    "selector_base_hex": f"0x{selector_base:04x}",
                })
        else:
            partial.append(base)
    unique = {}
    for config in complete:
        key = (config["function"], config["pointer_base"],
               config["selector_base"])
        unique[key] = config
    return list(unique.values()), partial


def decode_selector(
    data: bytes, pointer_base: int, selector_base: int, index: int
) -> dict[str, Any]:
    selector_address = selector_base + index
    if not 0 <= selector_address < len(data):
        return {
            "logical_index": index,
            "status": "selector_out_of_rom",
        }
    selector = data[selector_address]
    result = {
        "logical_index": index,
        "logical_index_hex": f"0x{index:02x}",
        "selector_address": selector_address,
        "selector_address_hex": f"0x{selector_address:04x}",
        "selector": selector,
        "selector_hex": f"0x{selector:02x}",
    }
    if selector == 0xFF:
        result["status"] = "terminator"
        return result
    pointer_offset = selector & 0xFE
    pointer_address = pointer_base + pointer_offset
    result.update({
        "status": "mapped",
        "interpolate_second_dimension": bool(selector & 1),
        "pointer_byte_offset": pointer_offset,
        "pointer_address": pointer_address,
        "pointer_address_hex": f"0x{pointer_address:04x}",
        "pointer_slot": pointer_offset // 2,
    })
    if (MASTER_BASE <= pointer_address < MASTER_END
            and (pointer_address - MASTER_BASE) % 2 == 0):
        result["absolute_master_slot"] = (
            pointer_address - MASTER_BASE
        ) // 2
    if 0 <= pointer_address + 1 < len(data):
        target = int.from_bytes(
            data[pointer_address:pointer_address + 2], "big"
        )
        result["target"] = target
        result["target_hex"] = f"0x{target:04x}"
    else:
        result["status"] = "pointer_out_of_rom"
    return result


def used_indices(dataflow: dict[str, Any]) -> list[int]:
    return sorted({
        index
        for call in dataflow["calls"].values()
        if call["possible_indices"] is not None
        for index in call["possible_indices"]
    })


def selector_tables(
    data: bytes,
    configurations: list[dict[str, Any]],
    indices: list[int],
) -> list[dict[str, Any]]:
    tables = {}
    for config in configurations:
        key = (config["pointer_base"], config["selector_base"])
        if key not in tables:
            slots = []
            for index in range(256):
                item = decode_selector(
                    data, config["pointer_base"],
                    config["selector_base"], index
                )
                slots.append(item)
                if item["status"] in {
                    "terminator", "selector_out_of_rom",
                    "pointer_out_of_rom",
                }:
                    break
            tables[key] = {
                "pointer_base": config["pointer_base"],
                "pointer_base_hex": config["pointer_base_hex"],
                "selector_base": config["selector_base"],
                "selector_base_hex": config["selector_base_hex"],
                "configured_by": [],
                "slots": slots,
                "observed_logical_slots": [
                    decode_selector(
                        data, config["pointer_base"],
                        config["selector_base"], index
                    )
                    for index in indices
                ],
            }
        tables[key]["configured_by"].append(config["function"])
    return list(tables.values())
