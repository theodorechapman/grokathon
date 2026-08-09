#!/usr/bin/env python3
"""Build an evidence-scored function and control-flow catalog."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from function_flow import (
    address_value,
    basic_block_starts,
    flow_graph,
    indirect_flows,
    reachable,
    reference_groups,
)

KNOWN_SEMANTICS = {
    "CODE:0073": "latch_watchdog_reset_cause",
    "CODE:0100": "eprom_program_and_verify",
    "CODE:0400": "calibration_lookup",
    "CODE:046a": "locate_descriptor_axis",
    "CODE:0493": "interpolate_descriptor_values",
    "CODE:04a2": "interpolate_second_axis",
    "CODE:21d8": "capcom_edge_and_injection_scheduler",
    "CODE:2462": "acquire_crank_sync_from_capture_intervals",
    "CODE:2564": "reset_crank_sync_state",
    "CODE:257d": "timer1_iac_pwm_and_watchdog_isr",
    "CODE:25f8": "enter_synchronized_crank_mode",
    "CODE:2606": "deferred_event_processing_isr",
    "CODE:261c": "synchronized_crank_event_dispatch",
    "CODE:27cc": "crank_period_output_and_cut_scheduler",
    "CODE:2ce8": "acquire_afm_sample_and_delta",
    "CODE:2d73": "afm_to_filtered_airmass",
    "CODE:2fd3": "compute_and_publish_injector_pulsewidth",
    "CODE:3585": "update_ignition_and_transient_corrections",
    "CODE:3610": "lookup_base_ignition_advance",
    "CODE:36fa": "encode_saturated_ignition_correction",
    "CODE:3711": "lookup_ignition_dwell_reference",
    "CODE:3723": "update_decel_overrun_latch",
    "CODE:3800": "assemble_fuel_corrections",
    "CODE:3a83": "evaluate_wot_fuel_variant",
    "CODE:3fa0": "scale_filter_supply_voltage",
    "CODE:5c00": "early_hardware_init_and_restart",
    "CODE:5d10": "clear_iram_and_prepare_timer1",
    "CODE:601a": "foreground_cyclic_executive",
    "CODE:6099": "publish_engine_speed_and_load",
    "CODE:61b3": "commit_discrete_output_shadow",
    "CODE:6327": "schedule_supplemental_compare_pulse",
    "CODE:678e": "adaptive_trim_supervisor",
    "CODE:6bb7": "idle_target_and_iac_pwm_controller",
    "CODE:6db6": "publish_iac_pwm_reload_pairs",
    "CODE:7930": "configure_lookup_45c0_4000",
    "CODE:798b": "select_calibration_selector_variant",
    "CODE:8000": "compare_capture_service",
    "CODE:8475": "kw71_protocol_engine",
    "CODE:89c4": "clear_fault_memory",
    "CODE:8960": "serial_interrupt_worker",
    "CODE:8bac": "diagnostic_command_dispatch",
    "CODE:8e50": "update_fault_record",
    "CODE:8f97": "cold_xram_initialize",
    "CODE:9016": "verify_combined_rom_checksum",
    "CODE:90f5": "test_internal_ram_patterns",
    "CODE:955c": "age_fault_records",
    "CODE:9e88": "scan_and_scale_analog_sensors",
    "CODE:9ec2": "adc_read_channel_blocking",
}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def subsystem_hints(
    function: dict[str, Any],
    groups: dict[str, list[str]],
    logical_lookup_indices: list[int],
) -> list[str]:
    hints = []
    name = function["name"]
    if "vector" in name or "isr_" in name:
        hints.append("interrupt_dispatch")
    if function["entry"] == "CODE:0400":
        hints.append("calibration_lookup")
    sfrs = set(groups.get("SFR", []))
    bits = set(groups.get("BITS", []))
    if sfrs & {"SFR:00d8", "SFR:00d9", "SFR:00da"}:
        hints.append("sensor_adc")
    if sfrs & {
        "SFR:00c1", "SFR:00c2", "SFR:00c3", "SFR:00c4",
        "SFR:00c5", "SFR:00c6", "SFR:00c7", "SFR:00ca",
        "SFR:00cb", "SFR:00cc", "SFR:00cd",
    }:
        hints.append("timing_compare_capture")
    if sfrs & {"SFR:0098", "SFR:0099"}:
        hints.append("serial_diagnostics")
    if sfrs & {"SFR:0088", "SFR:0089", "SFR:008a", "SFR:008c"}:
        hints.append("timer_scheduler")
    if logical_lookup_indices:
        hints.append("calibration_consumer")
    if bits and not hints:
        hints.append("bit_state_control")
    return sorted(set(hints)) or ["unknown"]


def confidence(
    function: dict[str, Any], reached: bool, hints: list[str]
) -> tuple[str, list[str]]:
    entry = address_value(function["entry"])
    reasons = []
    if not isinstance(function["decompiled"], str):
        reasons.append("decompiler_error")
    invalid_flows = [
        ref["to"] for ref in function["references"]
        if ref["space"] == "CODE" and address_value(ref["to"]) >= 0xA000
    ]
    if invalid_flows:
        reasons.append("flow_outside_rom")
    if entry >= 0x9B00:
        reasons.append("speculative_high_rom")
    if not reached:
        reasons.append("not_reached_from_vector_graph")
    seeded = not function["name"].startswith(("FUN_", "thunk_FUN_"))
    if seeded and not reasons:
        return "high", ["user_seeded_or_hardware_defined"]
    if reasons:
        return "low", reasons
    if hints != ["unknown"]:
        return "medium", ["cross_reference_based_role"]
    return "medium", ["valid_reachable_code_without_semantic_name"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("program_model", type=Path)
    parser.add_argument("calibrations", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument("--symbols", type=Path, required=True)
    args = parser.parse_args()
    program = load(args.program_model)
    calibration = load(args.calibrations)
    indices_by_function: dict[str, set[int]] = {}
    for pointer in calibration["pointers"]:
        for function in pointer["literal_r2_functions"]:
            indices_by_function.setdefault(function, set()).add(
                pointer["index"]
            )
    graph = flow_graph(program["functions"])
    reached = reachable(graph)
    catalog = []
    symbols = []
    for function in program["functions"]:
        groups = reference_groups(function)
        indices = sorted(indices_by_function.get(function["entry"], set()))
        hints = subsystem_hints(function, groups, indices)
        score, reasons = confidence(
            function, function["entry"] in reached, hints
        )
        rejected = bool({
            "decompiler_error",
            "flow_outside_rom",
            "speculative_high_rom",
        } & set(reasons))
        record = {
            "entry": function["entry"],
            "name": function["name"],
            "semantic_name": KNOWN_SEMANTICS.get(
                function["entry"],
                function["name"]
                if not function["name"].startswith(("FUN_", "thunk_FUN_"))
                else f"unknown_{function['entry'].split(':')[1]}",
            ),
            "confidence": score,
            "confidence_reasons": reasons,
            "reachable_from_vectors": function["entry"] in reached,
            "classification": (
                "rejected_speculative_decode"
                if rejected else "accepted_reachable_code"
            ),
            "callers": function["callers"],
            "callees": sorted(graph[function["entry"]]),
            "basic_block_starts": basic_block_starts(function),
            "indirect_flows": indirect_flows(function),
            "instruction_count": len(function["instructions"]),
            "reference_groups": groups,
            "logical_lookup_indices": indices,
            "subsystem_hints": hints,
        }
        catalog.append(record)
        symbols.append({
            "kind": "function",
            "address": record["entry"],
            "name": record["semantic_name"],
            "confidence": score,
            "evidence": reasons + hints,
        })
    report = {
        "function_count": len(catalog),
        "reachable_from_vector_count": sum(
            item["reachable_from_vectors"] for item in catalog
        ),
        "accepted_reachable_count": sum(
            item["classification"] == "accepted_reachable_code"
            for item in catalog
        ),
        "rejected_speculative_count": sum(
            item["classification"] == "rejected_speculative_decode"
            for item in catalog
        ),
        "confidence_counts": dict(Counter(
            item["confidence"] for item in catalog
        )),
        "indirect_flow_count": sum(
            len(item["indirect_flows"]) for item in catalog
        ),
        "functions": catalog,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.symbols.write_text(json.dumps({"symbols": symbols}, indent=2) + "\n")


if __name__ == "__main__":
    main()
