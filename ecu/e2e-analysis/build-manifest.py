#!/usr/bin/env python3
"""Verify canonical Motronic images and emit provenance facts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


INTERNAL_SIZE = 0x2000
COMBINED_SIZE = 0xA000


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def programmed_ranges(data: bytes) -> list[dict[str, Any]]:
    ranges = []
    start = None
    for offset, value in enumerate(data + b"\xff"):
        if value != 0xFF and start is None:
            start = offset
        elif value == 0xFF and start is not None:
            ranges.append({
                "start": start,
                "start_hex": f"0x{start:04x}",
                "end": offset,
                "end_hex": f"0x{offset:04x}",
                "size": offset - start,
            })
            start = None
    return ranges


def verify_mapping(external: bytes, combined: bytes) -> dict[str, Any]:
    low_matches = combined[0x2000:0x8000] == external[0x2000:0x8000]
    high_matches = combined[0x8000:0xA000] == external[0:0x2000]
    if not low_matches or not high_matches:
        raise ValueError("combined image does not contain the external EPROM")
    return {
        "cpu_0x2000_0x7fff_matches_external_same_offset": low_matches,
        "cpu_0x8000_0x9fff_matches_external_0x0000_0x1fff": high_matches,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("external", type=Path)
    parser.add_argument("combined", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    external = args.external.read_bytes()
    combined = args.combined.read_bytes()
    if len(external) != 0x8000:
        raise ValueError(f"expected 0x8000-byte EPROM, got {len(external):#x}")
    if len(combined) != COMBINED_SIZE:
        raise ValueError(
            f"expected 0xa000-byte combined image, got {len(combined):#x}"
        )
    internal = combined[:INTERNAL_SIZE]
    report = {
        "canonical_image": {
            "path": str(args.combined),
            "size": len(combined),
            "sha256": digest(combined),
            "provenance": (
                "Community UART-derived internal ROM combined with the "
                "external EPROM; strongly corroborated, not factory-authenticated."
            ),
        },
        "external_eprom": {
            "path": str(args.external),
            "size": len(external),
            "sha256": digest(external),
        },
        "internal_rom": {
            "cpu_range": "CODE:0000-1fff",
            "size": len(internal),
            "sha256": digest(internal),
            "sum16": sum(internal) & 0xFFFF,
            "sum16_hex": f"0x{sum(internal) & 0xFFFF:04x}",
            "non_ff_bytes": sum(value != 0xFF for value in internal),
            "programmed_ranges": programmed_ranges(internal),
        },
        "mapping_verification": verify_mapping(external, combined),
        "cpu_memory_map": [
            {
                "start": "0x0000",
                "end": "0x1fff",
                "source": "combined internal UART image",
            },
            {
                "start": "0x2000",
                "end": "0x7fff",
                "source": "external EPROM offsets 0x2000-0x7fff",
            },
            {
                "start": "0x8000",
                "end": "0x9fff",
                "source": "external EPROM offsets 0x0000-0x1fff",
            },
        ],
    }
    args.output.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
