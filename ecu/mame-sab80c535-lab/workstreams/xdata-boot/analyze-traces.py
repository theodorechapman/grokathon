#!/usr/bin/env python3

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = ("model", "no-xram")
PC_RE = re.compile(r"^CYC=(\d+)\s+([0-9a-f]{4}):", re.IGNORECASE | re.MULTILINE)
ACCESS_RE = re.compile(
    r"XDATA first op=([RW]) addr=([0-9a-f]{4}) pc=([0-9a-f]{4}) "
    r"value=([0-9a-f]{2}) class=([a-z0-9-]+) unknown=([01])",
    re.IGNORECASE,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fields(text: str, prefix: str) -> dict[str, str]:
    matches = re.findall(rf"^.*{re.escape(prefix)} (.+)$", text, re.MULTILINE)
    if len(matches) != 1:
        raise AssertionError(f"expected one {prefix!r} line, found {len(matches)}")
    result: dict[str, str] = {}
    for token in matches[0].split():
        key, value = token.split("=", 1)
        result[key] = value
    return result


def parse_case(name: str) -> tuple[dict[str, object], list[int]]:
    trace_path = ROOT / f"runtime-{name}-trace.log"
    console_path = ROOT / f"runtime-{name}-console.log"
    if not trace_path.is_file() or not console_path.is_file():
        raise AssertionError(f"missing runtime artifacts for {name}")

    trace = trace_path.read_text(encoding="utf-8")
    console = console_path.read_text(encoding="utf-8")
    pc_matches = PC_RE.findall(trace)
    if not pc_matches:
        raise AssertionError(f"{name} trace has no cycle-tagged instructions")
    pcs = [int(pc, 16) for _, pc in pc_matches]
    cycles = [int(cycle) for cycle, _ in pc_matches]
    execution = fields(console, "EXEC summary")
    xdata = fields(console, "XDATA summary")
    accesses = [
        {
            "op": op.upper(),
            "address": address.lower(),
            "pc": pc.lower(),
            "value": value.lower(),
            "classification": classification.lower(),
            "unknown": unknown == "1",
        }
        for op, address, pc, value, classification, unknown in ACCESS_RE.findall(console)
    ]
    dependency = re.search(
        r"XDATA dependency first_unknown_read_pc=([0-9a-f]{4}) "
        r"decision_pc=([0-9a-f]{4}|unresolved)(?: value=([0-9a-f]{2}))?",
        console,
        re.IGNORECASE,
    )

    return (
        {
            "pc_observations": len(pcs),
            "last_observed_cycle": cycles[-1],
            "execution": execution,
            "xdata": xdata,
            "distinct_access_records": len(accesses),
            "early_accesses": accesses[:25],
            "first_unknown_dependency": (
                {
                    "read_pc": dependency.group(1).lower(),
                    "decision_pc": dependency.group(2).lower(),
                    "value": (dependency.group(3) or "").lower(),
                }
                if dependency
                else None
            ),
            "artifacts": {
                "trace": {
                    "path": trace_path.name,
                    "bytes": trace_path.stat().st_size,
                    "sha256": sha256(trace_path),
                },
                "console": {
                    "path": console_path.name,
                    "bytes": console_path.stat().st_size,
                    "sha256": sha256(console_path),
                },
            },
        },
        pcs,
    )


def first_divergence(left: list[int], right: list[int]) -> dict[str, object]:
    for index, (left_pc, right_pc) in enumerate(zip(left, right)):
        if left_pc != right_pc:
            return {
                "observation_index": index,
                "model_pc": f"{left_pc:04x}",
                "no_xram_pc": f"{right_pc:04x}",
            }
    return {
        "observation_index": min(len(left), len(right)),
        "model_pc": "end" if len(left) <= len(right) else f"{left[len(right)]:04x}",
        "no_xram_pc": "end" if len(right) <= len(left) else f"{right[len(left)]:04x}",
    }


def main() -> None:
    parsed: dict[str, object] = {}
    sequences: dict[str, list[int]] = {}
    for name in CASES:
        parsed[name], sequences[name] = parse_case(name)

    result = {
        "schema": 1,
        "baseline": {
            "pc_observations": 31,
            "startup_frontier": "5c00",
            "last_cycle": 48,
        },
        "cases": parsed,
        "xram_sensitivity": {
            "first_trace_divergence": first_divergence(
                sequences["model"], sequences["no-xram"]
            ),
            "interpretation": (
                "storage read-after-write selects cold initialization; disabling "
                "storage takes the alternate marker path"
            ),
        },
    }
    (ROOT / "runtime-summary.json").write_text(
        json.dumps(result, indent=2) + "\n",
        encoding="utf-8",
    )
    model = parsed["model"]
    execution = model["execution"]
    print(
        "ANALYZED:"
        f" {model['pc_observations']} model PC observations;"
        f" startup frontier {execution['startup_frontier']};"
        f" blocker {execution['reason']}"
    )


if __name__ == "__main__":
    main()
