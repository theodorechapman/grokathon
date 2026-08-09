#!/usr/bin/env python3
"""Publish deterministic, explicitly constrained software scenarios."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SCENARIOS = [
    {
        "name": "cold_start",
        "synthetic_input": 0,
        "logical_indices": [0, 1, 2],
        "static_path": [
            "CODE:0000", "CODE:0073", "CODE:20e0", "CODE:5c00",
        ],
        "claim": "reset reaches external initialization",
    },
    {
        "name": "warm_idle",
        "synthetic_input": 64,
        "logical_indices": [0, 3, 13],
        "claim": "lookup behavior at a mid-low abstract input",
    },
    {
        "name": "acceleration",
        "synthetic_input": 128,
        "logical_indices": [19, 20, 21],
        "claim": "lookup behavior at a mid-high abstract input",
    },
    {
        "name": "wide_open_throttle",
        "synthetic_input": 255,
        "logical_indices": [16, 17, 18],
        "claim": "lookup saturation behavior at byte maximum",
    },
    {
        "name": "deceleration",
        "synthetic_input": 64,
        "logical_indices": [8, 9, 10],
        "claim": "repeatable lookup behavior for a low abstract input",
    },
    {
        "name": "over_rev",
        "synthetic_input": 255,
        "logical_indices": [22, 23, 24],
        "claim": (
            "lookup saturation plus a code-proven primary rev-limit record "
            "consumer; not a whole-engine limiter activation"
        ),
    },
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("combined", type=Path)
    parser.add_argument("traces", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.combined.read_bytes()
    traces = json.loads(args.traces.read_text(encoding="utf-8"))
    by_key: dict[tuple[int, int], dict[str, Any]] = {
        (trace["synthetic_input"], trace["logical_index"]): trace
        for trace in traces["lookup_traces"]
    }
    fixtures = []
    for scenario in SCENARIOS:
        selected = [
            by_key[(scenario["synthetic_input"], index)]
            for index in scenario["logical_indices"]
        ]
        fixture = {
            **scenario,
            "validation_scope": "constrained_component_execution",
            "not_proven": [
                "sensor engineering units",
                "scheduler timing",
                "electrical output behavior",
                "whole-engine scenario state transitions",
            ],
            "lookup_results": [{
                "logical_index": trace["logical_index"],
                "result_acc": trace["result_acc"],
                "steps": trace["steps"],
                "completed_at_ret": trace["completed_at_ret"],
            } for trace in selected],
        }
        if scenario["name"] == "over_rev":
            fixture["rev_limit_records"] = {
                "primary": {
                    "address": "CODE:42d5",
                    "raw": data[0x42D5],
                    "buffer_raw": data[0x42D6],
                },
                "secondary": {
                    "address": "CODE:4313",
                    "raw": data[0x4313],
                    "buffer_raw": data[0x4314],
                },
            }
        fixtures.append(fixture)
    report = {
        "qualification": (
            "These are deterministic software-component fixtures. Scenario "
            "names organize evidence; they do not claim vehicle simulation."
        ),
        "scenarios": fixtures,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
