#!/usr/bin/env python3
"""Build an access-specific XDATA inventory from the exported disassembly."""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

TARGETS = (*range(0x0000, 0x0400), *range(0xA000, 0xA100))
BRANCHES = {"JC", "JNC", "JZ", "JNZ", "JB", "JNB", "JBC", "CJNE", "DJNZ"}


def number(text: str) -> int | None:
    match = re.fullmatch(r"#?0x([0-9a-f]+)", text, re.IGNORECASE)
    return int(match.group(1), 16) if match else None


def direct_accesses(function: dict) -> list[dict]:
    result = []
    for ref in function["references"]:
        if ref["space"] != "EXTMEM" or not (ref["read"] or ref["write"]):
            continue
        address = int(ref["to"].split(":")[1], 16)
        if address not in TARGETS:
            continue
        for op, present in (("R", ref["read"]), ("W", ref["write"])):
            if present:
                result.append(
                    {
                        "address": address,
                        "pc": int(ref["from"].split(":")[1], 16),
                        "op": op,
                        "function": function["entry"],
                        "source": "ghidra-direct-reference",
                        "confidence": "high",
                    }
                )
    return result


def nearest_constant(instructions: list[dict], index: int, target: str) -> int | None:
    for instruction in reversed(instructions[max(0, index - 40) : index]):
        if instruction["mnemonic"] in {"RET", "RETI", "LJMP", "AJMP", "SJMP"}:
            break
        operands = instruction["operands"]
        if instruction["mnemonic"] != "MOV" or not operands or operands[0] != target:
            continue
        return number(operands[1]) if len(operands) > 1 else None
    return None


def lifted_accesses(function: dict) -> list[dict]:
    instructions = function["instructions"]
    result = []
    for index, instruction in enumerate(instructions):
        if instruction["mnemonic"] != "MOVX":
            continue
        text = instruction["text"]
        register = "R0" if "@R0" in text else "R1" if "@R1" in text else None
        if register is None:
            continue
        low = nearest_constant(instructions, index, register)
        page = nearest_constant(instructions, index, "0xa0")
        if low is None or page is None:
            continue
        address = (page << 8) | low
        if address not in TARGETS:
            continue
        op = "R" if text.startswith("MOVX A,") else "W"
        result.append(
            {
                "address": address,
                "pc": int(instruction["address"].split(":")[1], 16),
                "op": op,
                "function": function["entry"],
                "source": "page-lift-nearest-local-constants",
                "confidence": "medium",
            }
        )
    return result


def flow_for(function: dict, pc: int, op: str) -> dict:
    instructions = function["instructions"]
    index = next((i for i, item in enumerate(instructions)
                  if int(item["address"].split(":")[1], 16) == pc), None)
    if index is None:
        return {"producer_or_consumers": [], "branch_pc": None}
    if op == "W":
        window = instructions[max(0, index - 4) : index]
    else:
        window = instructions[index + 1 : index + 9]
    texts = [item["address"] + " " + item["text"] for item in window]
    branch = next(
        (item["address"] for item in window if item["mnemonic"] in BRANCHES),
        None,
    )
    return {"producer_or_consumers": texts, "branch_pc": branch}


def classify(address: int, op: str, has_other_op: bool) -> tuple[str, str]:
    if address in (0xA040, 0xA041):
        return (
            ("input-status" if op == "R" else "output-latch"),
            ("high" if op == "W" else "medium"),
        )
    if address == 0xA081 and op == "R":
        return "input-status", "medium"
    if 0xA000 <= address <= 0xA0FF:
        return "unknown-asic-register", "low"
    if address in (0x0000, 0x015A, 0x015B, 0x020B, 0x020C):
        return "retained-marker-storage", "high"
    if 0x0300 <= address <= 0x03FF:
        return "record-storage", "high"
    if has_other_op:
        return "storage", "medium"
    return "storage-candidate", "low"


def add_proven_loops(accesses: list[dict]) -> None:
    for address in range(0x0081, 0x00F2):
        accesses.append(
            {"address": address, "pc": 0x8FA6, "op": "W",
             "function": "CODE:8f97", "source": "bounded-r0-clear-loop",
             "confidence": "high"}
        )
    for address in range(0x0300, 0x0400):
        accesses.append(
            {"address": address, "pc": 0x8FAF, "op": "W",
             "function": "CODE:8f97", "source": "bounded-dptr-clear-loop",
             "confidence": "high"}
        )


def build(model: dict) -> dict:
    functions = model["functions"]
    by_entry = {item["entry"]: item for item in functions}
    accesses = []
    for function in functions:
        accesses.extend(direct_accesses(function))
        accesses.extend(lifted_accesses(function))
    add_proven_loops(accesses)
    unique = {
        (item["address"], item["pc"], item["op"]): item
        for item in accesses
    }
    grouped = defaultdict(list)
    for item in unique.values():
        grouped[item["address"]].append(item)
    entries = []
    for address in TARGETS:
        records = sorted(grouped[address], key=lambda item: (item["pc"], item["op"]))
        read_pcs = sorted({item["pc"] for item in records if item["op"] == "R"})
        write_pcs = sorted({item["pc"] for item in records if item["op"] == "W"})
        operations = []
        for item in records:
            function = by_entry.get(item["function"])
            flow = flow_for(function, item["pc"], item["op"]) if function else {}
            other = bool(write_pcs if item["op"] == "R" else read_pcs)
            classification, confidence = classify(address, item["op"], other)
            operations.append(
                {
                    **item,
                    "pc": f"{item['pc']:04x}",
                    "classification": classification,
                    "classification_confidence": confidence,
                    "value_flow": flow,
                }
            )
        entries.append(
            {
                "address": f"{address:04x}",
                "accessed": bool(records),
                "first_pc": f"{records[0]['pc']:04x}" if records else None,
                "last_pc": f"{records[-1]['pc']:04x}" if records else None,
                "readers": sorted({item["function"] for item in records if item["op"] == "R"}),
                "writers": sorted({item["function"] for item in records if item["op"] == "W"}),
                "read_after_write_static_candidate": bool(read_pcs and write_pcs),
                "operations": operations,
            }
        )
    return {
        "schema": 2,
        "scope": ["0000-03ff", "a000-a0ff"],
        "source": "ecu/e2e-analysis/program-model.json",
        "limitations": [
            "MOVX @Ri page lifting uses nearest local constant assignments.",
            "Static read/write presence is not temporal read-after-write proof.",
            "Unaccessed means absent from accepted exported functions, not impossible.",
        ],
        "addresses": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("program_model", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    model = json.loads(args.program_model.read_text(encoding="utf-8"))
    args.output.write_text(json.dumps(build(model), separators=(",", ":")) + "\n")
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
