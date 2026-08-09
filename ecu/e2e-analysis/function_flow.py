"""Control-flow helpers for the function catalog."""

from __future__ import annotations

from collections import deque
from typing import Any


VECTOR_ROOTS = {
    "CODE:0000", "CODE:0003", "CODE:000b", "CODE:0013", "CODE:001b",
    "CODE:0023", "CODE:002b", "CODE:0043", "CODE:004b", "CODE:0053",
    "CODE:005b", "CODE:0063", "CODE:006b",
}
BRANCHES = {
    "AJMP", "LJMP", "SJMP", "JMP", "JZ", "JNZ", "JC", "JNC", "JB",
    "JNB", "JBC", "CJNE", "DJNZ",
}
CONDITIONAL_BRANCHES = {
    "JZ", "JNZ", "JC", "JNC", "JB", "JNB", "JBC", "CJNE", "DJNZ",
}


def address_value(address: str) -> int:
    return int(address.split(":")[1], 16)


def reference_groups(function: dict[str, Any]) -> dict[str, list[str]]:
    groups: dict[str, set[str]] = {}
    for reference in function["references"]:
        groups.setdefault(reference["space"], set()).add(reference["to"])
    return {
        space: sorted(addresses)
        for space, addresses in sorted(groups.items())
    }


def flow_graph(functions: list[dict[str, Any]]) -> dict[str, set[str]]:
    entries = {function["entry"] for function in functions}
    graph = {entry: set() for entry in entries}
    for function in functions:
        for reference in function["references"]:
            if reference["flow"] and reference["to"] in entries:
                graph[function["entry"]].add(reference["to"])
    return graph


def reachable(graph: dict[str, set[str]]) -> set[str]:
    seen = set()
    queue = deque(root for root in VECTOR_ROOTS if root in graph)
    while queue:
        entry = queue.popleft()
        if entry in seen:
            continue
        seen.add(entry)
        queue.extend(graph[entry] - seen)
    return seen


def basic_block_starts(function: dict[str, Any]) -> list[str]:
    instructions = function["instructions"]
    if not instructions:
        return []
    addresses = {
        instruction["address"]: index
        for index, instruction in enumerate(instructions)
    }
    leaders = {instructions[0]["address"]}
    for index, instruction in enumerate(instructions):
        mnemonic = instruction["mnemonic"]
        if mnemonic not in BRANCHES:
            continue
        for reference in function["references"]:
            if (reference["from"] == instruction["address"]
                    and reference["to"] in addresses):
                leaders.add(reference["to"])
        if mnemonic in CONDITIONAL_BRANCHES and index + 1 < len(instructions):
            leaders.add(instructions[index + 1]["address"])
    return sorted(leaders, key=address_value)


def indirect_flows(function: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for instruction in function["instructions"]:
        if (instruction["mnemonic"] != "JMP"
                or not any("@" in operand
                           for operand in instruction["operands"])):
            continue
        targets = sorted({
            reference["to"]
            for reference in function["references"]
            if reference["from"] == instruction["address"]
            and reference["flow"]
        })
        result.append({
            "address": instruction["address"],
            "text": instruction["text"],
            "resolved_targets": targets,
            "status": "resolved_by_ghidra" if targets else "unresolved",
        })
    return result
