#!/usr/bin/env python3
"""Aggregate runtime state references and propagate lookup indices."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from runtime_names import INFERRED_STATE, KNOWN_STATE, state_name


STATE_SPACES = {"EXTMEM", "INTMEM", "SFR", "BITS"}
UNCONDITIONAL = {"AJMP", "LJMP", "SJMP", "JMP"}
RETURNS = {"RET", "RETI"}
MAX_VALUES = 32


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def offset(address: str) -> int:
    return int(address.split(":")[1], 16)


def aggregate_state(functions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for function in functions:
        for reference in function["references"]:
            if reference["space"] not in STATE_SPACES:
                continue
            address = reference["to"]
            record = records.setdefault(address, {
                "address": address,
                "space": reference["space"],
                "readers": set(),
                "writers": set(),
                "unknown_accessors": set(),
                "reference_count": 0,
            })
            record["reference_count"] += 1
            if reference["read"]:
                record["readers"].add(function["entry"])
            if reference["write"]:
                record["writers"].add(function["entry"])
            if not reference["read"] and not reference["write"]:
                record["unknown_accessors"].add(function["entry"])
    result = []
    for address, record in sorted(
        records.items(), key=lambda item: (item[1]["space"], offset(item[0]))
    ):
        for key in ("readers", "writers", "unknown_accessors"):
            record[key] = sorted(record[key])
        record["name"] = state_name(address)
        record["confidence"] = (
            "medium" if address in INFERRED_STATE
            else "high" if address in KNOWN_STATE
            else "high" if record["space"] == "SFR"
            else "low"
        )
        result.append(record)
    return result


def join(
    existing: set[int] | None | object,
    incoming: set[int] | None,
) -> set[int] | None:
    if existing is _MISSING:
        return incoming
    if existing is None or incoming is None:
        return None
    merged = existing | incoming
    return merged if len(merged) <= MAX_VALUES else None


_MISSING = object()


def transfer(instruction: dict[str, Any], values: set[int] | None):
    mnemonic = instruction["mnemonic"]
    operands = instruction["operands"]
    if mnemonic == "MOV" and operands and operands[0] == "R2":
        if len(operands) > 1 and operands[1].startswith("#0x"):
            return {int(operands[1][1:], 16)}
        return None
    if mnemonic == "INC" and operands == ["R2"] and values is not None:
        return {(value + 1) & 0xFF for value in values}
    if mnemonic in {"DEC", "DJNZ"} and operands[0] == "R2":
        if values is None:
            return None
        return {(value - 1) & 0xFF for value in values}
    if (mnemonic in {"LCALL", "ACALL"}
            and operands and operands[0] == "0x0400"):
        if values is None:
            return None
        return {(value + 1) & 0xFF for value in values}
    return values


def successors(
    function: dict[str, Any], index: int, by_address: dict[str, int]
) -> list[int]:
    instructions = function["instructions"]
    instruction = instructions[index]
    mnemonic = instruction["mnemonic"]
    targets = [
        by_address[reference["to"]]
        for reference in function["references"]
        if (reference["from"] == instruction["address"]
            and reference["flow"] and not reference["call"]
            and reference["to"] in by_address)
    ]
    if mnemonic in RETURNS:
        return []
    if mnemonic in UNCONDITIONAL:
        return targets
    if index + 1 < len(instructions):
        targets.append(index + 1)
    return sorted(set(targets))


def propagate_function(function: dict[str, Any]) -> dict[str, Any]:
    instructions = function["instructions"]
    if not instructions:
        return {}
    by_address = {
        instruction["address"]: index
        for index, instruction in enumerate(instructions)
    }
    states: dict[int, set[int] | None] = {0: None}
    queue = deque([0])
    calls: dict[str, set[int] | None] = {}
    while queue:
        index = queue.popleft()
        before = states[index]
        instruction = instructions[index]
        if (instruction["mnemonic"] in {"LCALL", "ACALL"}
                and instruction["operands"]
                and instruction["operands"][0] == "0x0400"):
            previous = calls.get(instruction["address"], _MISSING)
            calls[instruction["address"]] = join(previous, before)
        after = transfer(instruction, before)
        for successor in successors(function, index, by_address):
            previous = states.get(successor, _MISSING)
            merged = join(previous, after)
            if previous is _MISSING or merged != previous:
                states[successor] = merged
                queue.append(successor)
    return {
        address: None if values is None else sorted(values)
        for address, values in calls.items()
    }


def lookup_dataflow(functions: list[dict[str, Any]]) -> dict[str, Any]:
    calls = {}
    for function in functions:
        for address, values in propagate_function(function).items():
            calls[address] = {
                "function": function["entry"],
                "possible_indices": values,
                "status": (
                    "resolved_set" if values is not None else "dynamic"
                ),
            }
    calls["CODE:3640"]["unresolved_dependency"] = (
        "R2 is live on entry to CODE:3610 through the CODE:3585 -> "
        "CODE:212a wrapper chain. The call is a descriptor-probing loop; "
        "CODE:040f increments R2 after each probe. Intraprocedural proof "
        "cannot bound the initial value without modeling the custom ABI."
    )
    return {
        "call_count": len(calls),
        "resolved_set_count": sum(
            call["possible_indices"] is not None for call in calls.values()
        ),
        "calls": calls,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("program_model", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument("--lookup", type=Path, required=True)
    parser.add_argument("--symbols", type=Path, required=True)
    args = parser.parse_args()
    program = load(args.program_model)
    states = aggregate_state(program["functions"])
    args.output.write_text(json.dumps({
        "state_location_count": len(states),
        "locations": states,
    }, indent=2) + "\n")
    lookup = lookup_dataflow(program["functions"])
    args.lookup.write_text(json.dumps(lookup, indent=2) + "\n")
    symbols = load(args.symbols)
    symbols["symbols"] = [
        symbol for symbol in symbols["symbols"]
        if symbol["kind"] != "state"
    ] + [{
        "kind": "state",
        "address": state["address"],
        "name": state["name"],
        "confidence": state["confidence"],
        "evidence": {
            "readers": state["readers"],
            "writers": state["writers"],
        },
    } for state in states]
    args.symbols.write_text(json.dumps(symbols, indent=2) + "\n")


if __name__ == "__main__":
    main()
