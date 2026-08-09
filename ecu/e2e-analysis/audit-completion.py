#!/usr/bin/env python3
"""Audit reconstruction completion gates and publish exceptions."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("analysis", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.analysis
    functions = load(root / "function-catalog.json")
    program = load(root / "program-model.json")
    calibration = load(root / "calibration-index.json")
    lookup = load(root / "lookup-dataflow.json")
    hardware = load(root / "hardware-model.json")
    runtime = load(root / "runtime-state.json")
    validation = load(root / "traces/validation-summary.json")
    integrity = load(root / "integrity.json")
    by_entry = {
        function["entry"]: function
        for function in program["functions"]
    }
    invalid_accepted_flows = []
    for function in functions["functions"]:
        if function["classification"] != "accepted_reachable_code":
            continue
        for reference in by_entry[function["entry"]]["references"]:
            if (reference["flow"] and reference["space"] == "CODE"
                    and int(reference["to"].split(":")[1], 16) >= 0xA000):
                invalid_accepted_flows.append({
                    "function": function["entry"],
                    "from": reference["from"],
                    "to": reference["to"],
                })
    unnamed = [
        function["entry"] for function in functions["functions"]
        if not function["semantic_name"]
    ]
    unresolved_calls = [
        call for call in lookup["calls"].values()
        if call["possible_indices"] is None
        and not call.get("unresolved_dependency")
    ]
    unresolved_indirects = [
        {
            "function": function["entry"],
            **flow,
        }
        for function in functions["functions"]
        if function["classification"] == "accepted_reachable_code"
        for flow in function["indirect_flows"]
        if flow["status"] == "unresolved"
    ]
    write_only_state = [
        location["address"] for location in runtime["locations"]
        if (location["writers"] and not location["readers"]
            and location["space"] in {"INTMEM", "EXTMEM"})
    ]
    subsystem_docs = sorted((root / "subsystems").glob("*.md"))
    gates = {
        "canonical_size_0xa000":
            load(root / "manifest.json")["canonical_image"]["size"] == 0xA000,
        "all_functions_named_or_unknown": not unnamed,
        "accepted_flows_stay_in_rom": not invalid_accepted_flows,
        "accepted_indirect_flows_resolved": not unresolved_indirects,
        "pointer_count_150": calibration["pointer_count"] == 150,
        "active_xdf_tables_35": calibration["xdf_table_count"] == 35,
        "all_lookup_calls_classified":
            lookup["call_count"] == 76 and not unresolved_calls,
        "all_vectors_classified": len(hardware["vectors"]) == 13,
        "major_output_roles_classified": {
            endpoint["name"] for endpoint in hardware["logical_endpoints"]
        } >= {
            "ignition_coil_drive", "injector_bank_a_drive",
            "injector_bank_b_drive", "iac_valve_drive",
            "discrete_output_latch",
        },
        "runtime_checksum_verified": (
            integrity["exact_sum_match"]
            and integrity["runtime_verifier"]["evidence_matched"]
        ),
        "eleven_subsystem_specs": len(subsystem_docs) == 11,
        "reset_trace_passes": validation["reset"]["passed"],
        "all_lookup_traces_pass":
            validation["lookup_failure_count"] == 0,
    }
    report = {
        "passed": all(gates.values()),
        "gates": gates,
        "counts": {
            "represented_functions": functions["function_count"],
            "accepted_reachable_functions":
                functions["accepted_reachable_count"],
            "rejected_speculative_functions":
                functions["rejected_speculative_count"],
            "runtime_locations": runtime["state_location_count"],
            "write_only_idata_xram_locations": len(write_only_state),
            "selector_decoded_descriptors":
                calibration["selector_decoded_descriptor_count"],
            "exact_xdf_payload_matches":
                calibration["xdf_exact_descriptor_payload_count"],
        },
        "exceptions": {
            "unnamed_functions": unnamed,
            "invalid_accepted_flows": invalid_accepted_flows,
            "unclassified_lookup_calls": unresolved_calls,
            "unresolved_indirect_flows": unresolved_indirects,
            "write_only_idata_xram": write_only_state,
        },
        "notes": [
            (
                "Write-only IDATA/XRAM can be output, mailbox, or clear-only "
                "state; it is retained as an explicit exception, not invented "
                "as a consistent reader."
            ),
            (
                "Rejected speculative functions remain in the lossless "
                "program export with low-confidence reasons."
            ),
        ],
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    if not report["passed"]:
        raise SystemExit("completion audit failed")


if __name__ == "__main__":
    main()
