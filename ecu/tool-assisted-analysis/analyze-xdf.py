#!/usr/bin/env python3
"""Parse the legacy XDF and validate its definitions against the firmware."""

from __future__ import annotations

import argparse
import ast
import json
import operator
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


BLOCK_RE = re.compile(r"%%(HEADER|TABLE|CONSTANT)%%\s*(.*?)%%END%%", re.S)
FIELD_RE = re.compile(r"^\s*(\d{6})\s+(\w+)\s*=(.*)$", re.M)
OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def parse_value(text: str) -> Any:
    value = text.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace(r"\"", '"')
    if value == "(null)":
        return None
    if value.lower().startswith("0x"):
        return int(value, 16)
    try:
        return float(value) if "." in value else int(value)
    except ValueError:
        return value


def parse_blocks(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="latin-1")
    blocks = []
    for kind, body in BLOCK_RE.findall(text):
        fields = {name: parse_value(value)
                  for _, name, value in FIELD_RE.findall(body)}
        fields["kind"] = kind.lower()
        blocks.append(fields)
    return blocks


def evaluate_node(node: ast.AST, raw: int) -> float:
    if isinstance(node, ast.Expression):
        return evaluate_node(node.body, raw)
    if isinstance(node, ast.Name) and node.id == "X":
        return float(raw)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and type(node.op) in OPERATORS:
        return OPERATORS[type(node.op)](evaluate_node(node.operand, raw))
    if isinstance(node, ast.BinOp) and type(node.op) in OPERATORS:
        left = evaluate_node(node.left, raw)
        right = evaluate_node(node.right, raw)
        return OPERATORS[type(node.op)](left, right)
    raise ValueError("unsupported equation")


def convert(raw: int, equation: str | None) -> float | int | None:
    if not equation:
        return raw
    expression = equation.split(",", 1)[0].strip()
    try:
        value = evaluate_node(ast.parse(expression, mode="eval"), raw)
        return int(value) if value.is_integer() else round(value, 6)
    except (ArithmeticError, SyntaxError, ValueError):
        return None


def labels(value: Any) -> list[str] | None:
    if value is None:
        return None
    return [part.strip() for part in str(value).split(",")]


def analyze_entry(entry: dict[str, Any], data: bytes) -> dict[str, Any]:
    rows = int(entry.get("Rows", 1))
    cols = int(entry.get("Cols", 1))
    width = max(1, int(entry.get("SizeInBits", 8)) // 8)
    address = int(entry.get("Address", 0))
    count = rows * cols
    end = address + count * width
    raw_bytes = data[address:end] if 0 <= address < len(data) else b""
    raw_values = [
        int.from_bytes(raw_bytes[index:index + width], "little")
        for index in range(0, len(raw_bytes), width)
    ]
    equation = entry.get("Equation") or entry.get("ZEq")
    return {
        "kind": entry["kind"],
        "unique_id": entry.get("UniqueID"),
        "title": entry.get("Title"),
        "description": entry.get("Desc"),
        "address": address,
        "address_hex": f"0x{address:04x}",
        "end": end,
        "end_hex": f"0x{end:04x}",
        "rows": rows,
        "cols": cols,
        "width": width,
        "equation": equation,
        "x_labels": labels(entry.get("XLabels")),
        "y_labels": labels(entry.get("YLabels")),
        "units": entry.get("Units") or entry.get("ZUnits"),
        "raw_hex": raw_bytes.hex(),
        "raw_values": raw_values,
        "values": [convert(value, equation) for value in raw_values],
        "in_bounds": end <= len(data),
        "is_separator": address == 0 and str(entry.get("Title", "")).startswith("-"),
    }


def collect_issues(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    issues = []
    for entry in entries:
        if entry["is_separator"]:
            continue
        if not entry["in_bounds"]:
            issues.append({"type": "out_of_bounds", "title": entry["title"]})
        for axis, expected in (("x_labels", entry["cols"]),
                               ("y_labels", entry["rows"])):
            actual = entry[axis]
            if actual is not None and len(actual) != expected:
                issues.append({
                    "type": "axis_label_count_mismatch",
                    "title": entry["title"],
                    "axis": axis[0],
                    "expected": expected,
                    "actual": len(actual),
                })
    groups: dict[int, list[str]] = defaultdict(list)
    for entry in entries:
        if not entry["is_separator"]:
            groups[entry["address"]].append(str(entry["title"]))
    for address, titles in sorted(groups.items()):
        if len(titles) > 1:
            issues.append({
                "type": "duplicate_address_views",
                "address": address,
                "address_hex": f"0x{address:04x}",
                "titles": titles,
            })
    return issues


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    parser.add_argument("xdf", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.binary.read_bytes()
    blocks = parse_blocks(args.xdf)
    entries = [analyze_entry(block, data) for block in blocks
               if block["kind"] in {"table", "constant"}]
    header = next(block for block in blocks if block["kind"] == "header")
    report = {
        "header": header,
        "binary_size": len(data),
        "block_count": len(blocks),
        "entry_count": len(entries),
        "active_entry_count": sum(not entry["is_separator"] for entry in entries),
        "entries": entries,
        "issues": collect_issues(entries),
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
