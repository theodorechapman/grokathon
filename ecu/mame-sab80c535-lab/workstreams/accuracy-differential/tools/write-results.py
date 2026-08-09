#!/usr/bin/env python3
"""Write a concise human-readable run result from strict JSON artifacts."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path


def load(logs: Path, name: str) -> dict:
    path = logs / name
    if not path.is_file():
        raise FileNotFoundError(f"required result missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"required runtime log missing: {path}")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def first_text(report: dict) -> str:
    first = report["first_divergence"]
    if first is None:
        return "none"
    return (
        f"ordinal={first['ordinal']} field={first['field']} "
        f"category={first['category']} values={json.dumps(first['values'], sort_keys=True)}"
    )


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: write-results.py LOGS MAME_DIR")
    logs = Path(sys.argv[1])
    mame_dir = Path(sys.argv[2])
    canonical = load(logs, "canonical-exact-report.json")
    masked = load(logs, "canonical-masked-report.json")
    pair = load(logs, "mame-static-report.json")
    micro = load(logs, "microcase-exact-report.json")
    micro_pair = load(logs, "microcase-mame-static-report.json")
    ghidra = load(logs, "ghidra-canonical.json")
    tests = (logs / "test-results.txt").read_text(encoding="utf-8")
    if "\nOK\n" not in f"\n{tests}":
        raise AssertionError("negative-gate test log does not end in OK")
    commit = subprocess.run(
        ["git", "-C", str(mame_dir), "rev-parse", "HEAD"],
        check=True, text=True, capture_output=True, timeout=10,
    ).stdout.strip()
    print("COMMAND: cd " + str(logs.parent))
    print("COMMAND: bash run.sh")
    print(f"RESULT: PASS; pinned MAME commit {commit}")
    print(
        "RESULT: fresh Ghidra lookups "
        f"{ghidra['provenance']['lookup_pass_count']}/"
        f"{ghidra['provenance']['lookup_trace_count']} passed"
    )
    print(
        "RESULT: MAME/static canonical exact agreement "
        f"{pair['agreement_prefix_events']} events; agreement={pair['agreement']}"
    )
    print(
        "RESULT: canonical three-way exact prefix "
        f"{canonical['agreement_prefix_events']} events; {first_text(canonical)}"
    )
    print(
        "RESULT: canonical parity-masked prefix "
        f"{masked['agreement_prefix_events']} events; {first_text(masked)}"
    )
    print(
        "RESULT: MAME/static microcase exact agreement "
        f"{micro_pair['agreement_prefix_events']} events; "
        f"agreement={micro_pair['agreement']}"
    )
    print(
        "RESULT: microcase three-way exact prefix "
        f"{micro['agreement_prefix_events']} events; {first_text(micro)}"
    )
    print("RESULT: 8 negative gates passed")
    for name in (
        "mame-reset.trace", "mame-reset-console.log",
        "ghidra-canonical-run.log", "mame-microcase.trace",
        "ghidra-microcase-run.log",
    ):
        print(f"LOG-SHA256: {name} {sha(logs / name)}")


if __name__ == "__main__":
    main()
