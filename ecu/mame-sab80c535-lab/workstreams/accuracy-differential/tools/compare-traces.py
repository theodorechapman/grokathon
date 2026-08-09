#!/usr/bin/env python3
"""Strict first-divergence comparator for normalized instruction streams."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

EXPECTED_ENGINES = {
    "mame": True,
    "ghidra-emulatorhelper": True,
    "independent-static": False,
}


def validate_document(name: str, doc: dict[str, Any], expected_sha: str) -> None:
    if doc.get("schema") != "motronic-differential-event/v1":
        raise AssertionError(f"{name}: invalid event schema")
    provenance = doc.get("provenance")
    if not isinstance(provenance, dict):
        raise AssertionError(f"{name}: missing provenance")
    engine = provenance.get("engine")
    if engine not in EXPECTED_ENGINES:
        raise AssertionError(f"{name}: fabricated engine provenance {engine!r}")
    if provenance.get("runtime") is not EXPECTED_ENGINES[engine]:
        raise AssertionError(f"{name}: fabricated runtime provenance")
    if provenance.get("rom_sha256") != expected_sha:
        raise AssertionError(f"{name}: ROM provenance mismatch")
    if not provenance.get("command") or not provenance.get("tool_revision"):
        raise AssertionError(f"{name}: incomplete command/tool provenance")
    events = doc.get("events")
    if not isinstance(events, list) or not events:
        raise AssertionError(f"{name}: missing instruction events")
    previous_cycle = -1
    for ordinal, event in enumerate(events):
        if event.get("kind") != "instruction" or event.get("ordinal") != ordinal:
            raise AssertionError(f"{name}: malformed ordinal {ordinal}")
        cycle = event.get("cycles")
        if cycle is not None:
            if not isinstance(cycle, int) or cycle <= previous_cycle:
                raise AssertionError(f"{name}: non-monotonic cycles at {ordinal}")
            previous_cycle = cycle


def available(doc: dict[str, Any], field: str, item: str | None = None) -> bool:
    availability = doc["availability"]
    if field == "cycles":
        return availability.get("cycles") != "unavailable"
    if field == "register":
        return item in availability.get("registers", [])
    if field == "access":
        return availability.get("access_spaces", {}).get(item) != "unavailable"
    return availability.get("interrupts") != "unavailable"


def masked_values(
        values: dict[str, int], mask: int
) -> dict[str, int]:
    return {name: value & mask for name, value in values.items()}


def mismatch(
        ordinal: int,
        events: dict[str, dict[str, Any]],
        field: str,
        category: str,
        values: dict[str, Any],
        mask: int | None = None,
) -> dict[str, Any]:
    result = {
        "ordinal": ordinal,
        "pcs": {name: f"{event['pc']:04x}" for name, event in events.items()},
        "field": field,
        "category": category,
        "values": values,
    }
    if mask is not None:
        result["mask"] = f"0x{mask:x}"
    return result


def normalized_accesses(
        event: dict[str, Any], space: str, data_mask: int
) -> list[tuple[str, int, int]]:
    return sorted(
        (
            str(item["access"]),
            int(item["address"]),
            int(item["data"]) & data_mask,
        )
        for item in event.get("accesses", [])
        if item.get("space") == space
    )


def compare_documents(
        documents: dict[str, dict[str, Any]],
        expected_sha: str,
        masks: dict[str, int] | None = None,
        limit: int | None = None,
) -> dict[str, Any]:
    if len(documents) < 2:
        raise AssertionError("at least two independent streams are required")
    for name, document in documents.items():
        validate_document(name, document, expected_sha)
    masks = masks or {}
    compared: Counter[str] = Counter()
    unmatched: Counter[str] = Counter()
    lengths = {name: len(doc["events"]) for name, doc in documents.items()}
    count = min(lengths.values()) if limit is None else limit
    if any(length < count for length in lengths.values()):
        raise AssertionError(f"comparison limit {count} exceeds stream length {lengths}")
    first: dict[str, Any] | None = None
    for ordinal in range(count):
        events = {
            name: doc["events"][ordinal] for name, doc in documents.items()
        }
        pc_values = {name: int(event["pc"]) for name, event in events.items()}
        compared["pc"] += 1
        if len(set(pc_values.values())) != 1:
            first = mismatch(
                ordinal, events, "pc", "cpu_semantics", pc_values
            )
            break
        opcode_values = {
            name: int(event["opcode"]) for name, event in events.items()
        }
        compared["opcode"] += 1
        if len(set(opcode_values.values())) != 1:
            first = mismatch(
                ordinal, events, "opcode", "cpu_semantics", opcode_values
            )
            break
        cycle_values = {
            name: int(event["cycles"]) for name, event in events.items()
            if available(documents[name], "cycles")
        }
        for name in documents:
            if name not in cycle_values:
                unmatched[f"{name}:cycles"] += 1
        if len(cycle_values) >= 2:
            compared["cycles"] += 1
            if len(set(cycle_values.values())) != 1:
                first = mismatch(
                    ordinal, events, "cycles", "timing", cycle_values
                )
                break
        register_names = set().union(
            *(event.get("registers", {}).keys() for event in events.values())
        )
        for register in sorted(register_names):
            values = {
                name: int(event["registers"][register])
                for name, event in events.items()
                if available(documents[name], "register", register)
                and register in event.get("registers", {})
            }
            for name in documents:
                if name not in values:
                    unmatched[f"{name}:registers.{register}"] += 1
            if len(values) < 2:
                continue
            mask = masks.get(register, 0xFFFF if register == "dptr" else 0xFF)
            compared[f"registers.{register}"] += 1
            if len(set(masked_values(values, mask).values())) != 1:
                category = (
                    "peripheral_state" if register in {"ie", "ip"} else
                    "cpu_semantics"
                )
                first = mismatch(
                    ordinal, events, f"registers.{register}",
                    category, values, mask,
                )
                break
        if first:
            break
        data_mask = masks.get("access-data", 0xFF)
        for memory_space in ("idata", "sfr", "xdata"):
            values = {
                name: normalized_accesses(event, memory_space, data_mask)
                for name, event in events.items()
                if available(documents[name], "access", memory_space)
            }
            for name in documents:
                if name not in values:
                    unmatched[f"{name}:accesses.{memory_space}"] += 1
            if len(values) < 2:
                continue
            compared[f"accesses.{memory_space}"] += 1
            serialized = {json.dumps(value) for value in values.values()}
            if len(serialized) != 1:
                first = mismatch(
                    ordinal, events, f"accesses.{memory_space}",
                    "memory_mapping", values, data_mask,
                )
                break
        if first:
            break
        interrupt_values = {
            name: event.get("interrupt_entry") for name, event in events.items()
            if available(documents[name], "interrupt")
        }
        compared["interrupt_entry"] += 1
        if len(set(interrupt_values.values())) != 1:
            first = mismatch(
                ordinal, events, "interrupt_entry",
                "peripheral_state", interrupt_values,
            )
            break
    if first is None and limit is None and len(set(lengths.values())) != 1:
        first = {
            "ordinal": count,
            "pcs": {
                name: (
                    f"{doc['events'][count]['pc']:04x}"
                    if len(doc["events"]) > count else None
                )
                for name, doc in documents.items()
            },
            "field": "event_presence",
            "category": "unavailable_evidence",
            "values": lengths,
        }
    return {
        "agreement": first is None,
        "comparison_mode": "masked" if masks else "exact",
        "masks": {name: f"0x{value:x}" for name, value in masks.items()},
        "stream_lengths": lengths,
        "agreement_prefix_events": (
            count if first is None else int(first["ordinal"])
        ),
        "compared_fields": dict(sorted(compared.items())),
        "unmatched_fields": dict(sorted(unmatched.items())),
        "first_divergence": first,
    }
