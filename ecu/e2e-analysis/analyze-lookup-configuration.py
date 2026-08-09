#!/usr/bin/env python3
"""Recover lookup configurations and selector-decoded descriptors."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lookup_configuration import (
    collect_configurations,
    selector_tables,
    used_indices,
)
from lookup_descriptors import attach_consumers, enrich_descriptors


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_report(
    data: bytes,
    program: dict[str, Any],
    dataflow: dict[str, Any],
    calibration: dict[str, Any],
) -> dict[str, Any]:
    configurations, partial = collect_configurations(program["functions"])
    tables = selector_tables(
        data, configurations, used_indices(dataflow)
    )
    attach_consumers(calibration, dataflow, tables)
    enrich_descriptors(data, calibration, tables)
    return {
        "lookup_entry": "CODE:0400",
        "calling_convention": {
            "logical_index": "R2",
            "pointer_base": "INTMEM:0073-0074",
            "selector_base": "INTMEM:0075-0076",
            "selector_rule": (
                "selector[R2]; ff terminates; selector&fe is pointer byte "
                "offset; selector bit 0 selects second-dimension interpolation"
            ),
        },
        "complete_configurations": configurations,
        "partial_configurations": partial,
        "selector_tables": tables,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("combined", type=Path)
    parser.add_argument("program_model", type=Path)
    parser.add_argument("dataflow", type=Path)
    parser.add_argument("calibrations", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.combined.read_bytes()
    program = load(args.program_model)
    dataflow = load(args.dataflow)
    calibration = load(args.calibrations)
    report = build_report(data, program, dataflow, calibration)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.calibrations.write_text(json.dumps(calibration, indent=2) + "\n")


if __name__ == "__main__":
    main()
