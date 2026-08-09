#!/usr/bin/env python3
"""Extract reproducible facts from the Motronic 1.7 EPROM and its XDF."""

from __future__ import annotations

import argparse
import binascii
import json
import re
import zlib
from pathlib import Path
from typing import Any


BLOCK_RE = re.compile(r"%%(HEADER|TABLE|CONSTANT)%%\s*(.*?)%%END%%", re.S)
FIELD_RE = re.compile(r"^\s*(\d{6})\s+(\w+)\s*=(.*)$", re.M)


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


def parse_xdf(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="latin-1")
    blocks: list[dict[str, Any]] = []
    for kind, body in BLOCK_RE.findall(text):
        fields = {name: parse_value(value) for _, name, value in FIELD_RE.findall(body)}
        fields["kind"] = kind.lower()
        blocks.append(fields)
    return blocks


def width_for(entry: dict[str, Any]) -> int:
    return max(1, int(entry.get("SizeInBits", 8)) // 8)


def read_raw(data: bytes, address: int, width: int) -> int:
    return int.from_bytes(data[address : address + width], "little")


def convert(raw: int, equation: str | None) -> float | int | None:
    if not equation:
        return raw
    expression = equation.split(",", 1)[0].strip()
    allowed = expression.replace("X", str(raw))
    if not re.fullmatch(r"[0-9.+*/() -]+", allowed):
        return None
    try:
        return eval(allowed, {"__builtins__": {}}, {})  # noqa: S307
    except (ArithmeticError, SyntaxError):
        return None


def extract_entries(blocks: list[dict[str, Any]], data: bytes) -> list[dict[str, Any]]:
    extracted: list[dict[str, Any]] = []
    for entry in blocks:
        if entry["kind"] not in {"table", "constant"}:
            continue
        address = int(entry.get("Address", 0))
        if address == 0 and str(entry.get("Title", "")).startswith("-"):
            continue
        rows = int(entry.get("Rows", 1))
        cols = int(entry.get("Cols", 1))
        width = width_for(entry)
        count = rows * cols
        end = address + count * width
        raw_bytes = data[address:end]
        equation = entry.get("Equation") or entry.get("ZEq")
        values = [
            convert(read_raw(raw_bytes, index * width, width), equation)
            for index in range(count)
        ]
        extracted.append(
            {
                "kind": entry["kind"],
                "title": entry.get("Title"),
                "address": address,
                "end": end,
                "rows": rows,
                "cols": cols,
                "width": width,
                "equation": equation,
                "x_labels": entry.get("XLabels"),
                "y_labels": entry.get("YLabels"),
                "raw_hex": raw_bytes.hex(),
                "values": values,
            }
        )
    return extracted


def scan_pointer_index(data: bytes) -> list[dict[str, int]]:
    start = 0x45C0
    count = next(
        index
        for index in range(0x100)
        if data[start + index * 2 : start + index * 2 + 2] == b"\xff\xff"
    )
    return [
        {
            "index": index,
            "offset": start + index * 2,
            "target": int.from_bytes(data[start + index * 2 : start + index * 2 + 2], "big"),
        }
        for index in range(count)
    ]


def decode_axis(deltas: bytes) -> list[int]:
    suffix = 0
    values = []
    for delta in reversed(deltas):
        suffix += delta
        values.append((-suffix) & 0xFF)
    return list(reversed(values))


def parse_indexed_maps(data: bytes) -> list[dict[str, Any]]:
    targets = sorted({item["target"] for item in scan_pointer_index(data)})
    parsed = []
    for index, start in enumerate(targets):
        first_size = data[start + 1]
        end = targets[index + 1] if index + 1 < len(targets) else start + 2 + 2 * first_size
        first_end = start + 2 + first_size
        if not 0 < first_size <= 32 or first_end > end:
            continue
        axes = [(data[start], data[start + 2 : first_end])]
        data_start = first_end
        second_size = data[first_end + 1] if first_end + 1 < end else 0
        second_end = first_end + 2 + second_size
        if 0 < second_size <= 32 and second_end <= end:
            two_axis_end = second_end + first_size * second_size
            if two_axis_end == end:
                axes.append((data[first_end], data[first_end + 2 : second_end]))
                data_start = second_end
        expected = len(axes[0][1]) * (len(axes[1][1]) if len(axes) == 2 else 1)
        parsed.append(
            {
                "header": start,
                "end": end,
                "data": data_start,
                "exact_size": data_start + expected == end,
                "axes": [
                    {"ram": ram, "deltas": delta.hex(), "internal_values": decode_axis(delta)}
                    for ram, delta in axes
                ],
                "values": list(data[data_start : data_start + expected]),
            }
        )
    return parsed


def checksum_facts(data: bytes, complete_rom: bytes | None) -> dict[str, Any]:
    stored_be = int.from_bytes(data[0x7FFD:0x7FFF], "big")
    stored_le = int.from_bytes(data[0x7FFD:0x7FFF], "little")
    ranges = {}
    for start, end in [(0, 0x7FFD), (0x2000, 0x7FFD), (0, 0x8000)]:
        payload = data[start:end]
        ranges[f"{start:04x}-{end - 1:04x}"] = {
            "sum8": sum(payload) & 0xFF,
            "sum16": sum(payload) & 0xFFFF,
            "crc16_ccitt_0": binascii.crc_hqx(payload, 0),
            "crc16_ccitt_ffff": binascii.crc_hqx(payload, 0xFFFF),
            "crc32": zlib.crc32(payload),
            "word_sum_be": sum(
                int.from_bytes(payload[i : i + 2], "big") for i in range(0, len(payload) - 1, 2)
            )
            & 0xFFFF,
        }
    mapping_valid = complete_rom is not None and (
        len(complete_rom) == 0xA000
        and complete_rom[0x2000:] == data[0x2000:] + data[:0x2000]
    )
    complete_sum = sum(complete_rom[:0x9F00]) & 0xFFFF if mapping_valid else None
    return {
        "xdf_claim_offset": 0x7FFD,
        "xdf_claim_be": stored_be,
        "xdf_claim_le": stored_le,
        "runtime_offset": 0x1F00,
        "runtime_stored_be": int.from_bytes(data[0x1F00:0x1F02], "big"),
        "runtime_cpu_range": "0000-9eff",
        "runtime_calculated": complete_sum,
        "runtime_verified": complete_sum == int.from_bytes(data[0x1F00:0x1F02], "big"),
        "complete_rom_mapping_valid": mapping_valid,
        "mask_rom_sum16": sum(complete_rom[:0x2000]) & 0xFFFF if mapping_valid else None,
        "last_byte": data[-1],
        "last_non_ff": max(index for index, value in enumerate(data) if value != 0xFF),
        "non_ff_sum16": sum(value for value in data if value != 0xFF) & 0xFFFF,
        "candidate_sums": ranges,
    }


def build_report(bin_path: Path, xdf_path: Path) -> dict[str, Any]:
    data = bin_path.read_bytes()
    complete_path = bin_path.parent / "analysis" / "TotalCombinedROM.bin"
    complete_rom = complete_path.read_bytes() if complete_path.exists() else None
    blocks = parse_xdf(xdf_path)
    entries = extract_entries(blocks, data)
    return {
        "binary": {
            "path": str(bin_path),
            "size": len(data),
            "dme": data[0x1F02:0x1F0C].decode()[::-1],
            "software": data[0x1F0C:0x1F16].decode()[::-1],
            "complete_rom": str(complete_path) if complete_rom is not None else None,
            "complete_rom_size": len(complete_rom) if complete_rom is not None else None,
        },
        "xdf": {
            "path": str(xdf_path),
            "block_count": len(blocks),
            "entry_count": len(entries),
        },
        "checksum": checksum_facts(data, complete_rom),
        "pointer_index": scan_pointer_index(data),
        "indexed_maps": parse_indexed_maps(data),
        "entries": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    parser.add_argument("xdf", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_report(args.binary, args.xdf)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    main()
