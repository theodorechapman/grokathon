#!/usr/bin/env python3
"""Command-line edge for the strict trace comparator."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


def load_comparator():
    path = Path(__file__).with_name("compare-traces.py")
    spec = importlib.util.spec_from_file_location("comparison_core", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load comparator: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.compare_documents


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stream", action="append", required=True)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--mask", action="append", default=[])
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--require-agreement", action="store_true")
    args = parser.parse_args()
    documents = {}
    for item in args.stream:
        name, path = item.split("=", 1)
        documents[name] = json.loads(Path(path).read_text(encoding="utf-8"))
    masks = {
        name: int(value, 0)
        for name, value in (item.split("=", 1) for item in args.mask)
    }
    report = load_comparator()(
        documents, args.expected_sha, masks or None, args.limit
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.require_agreement and not report["agreement"]:
        raise SystemExit(
            "first divergence: " + json.dumps(report["first_divergence"])
        )


if __name__ == "__main__":
    main()
