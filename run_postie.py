#!/usr/bin/env python3
"""Launch a full, containerized Postie reverse-engineering run.

Run from anywhere:

    python3 run_postie.py

The generated workspace is written to ``pipeline/workspaces/`` by default.
Use ``--help`` to override the model, reasoning effort, service tier, label,
ROM, or output directory.
"""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parent
DEFAULT_ROM = REPO / "pipeline" / "raw_rom" / "postie.gbc"
DEFAULT_OUTPUT = REPO / "pipeline" / "workspaces"
DOCKER_RUNNER = REPO / "pipeline" / "harness" / "docker" / "run.sh"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rom",
        type=Path,
        default=DEFAULT_ROM,
        help=f"ROM to analyze (default: {DEFAULT_ROM.relative_to(REPO)})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"workspace directory (default: {DEFAULT_OUTPUT.relative_to(REPO)})",
    )
    parser.add_argument("--engine", choices=("codex", "grok"), default="codex")
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--effort", default="high")
    parser.add_argument("--tier", default="fast")
    parser.add_argument("--label", default="postie-full")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rom = args.rom.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()

    if not rom.is_file():
        raise SystemExit(f"ROM not found: {rom}")
    if not DOCKER_RUNNER.is_file():
        raise SystemExit(f"Docker runner not found: {DOCKER_RUNNER}")

    output_dir.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment.update(
        {
            "ENGINE": args.engine,
            "MODEL": args.model,
            "EFFORT": args.effort,
            "TIER": args.tier,
            "LABEL": args.label,
        }
    )

    print(f"ROM:       {rom}", flush=True)
    print(f"Workspaces: {output_dir}", flush=True)
    print(
        f"Agent:     {args.engine} / {args.model} / {args.effort} / {args.tier}",
        flush=True,
    )

    completed = subprocess.run(
        [str(DOCKER_RUNNER), str(rom), str(output_dir)],
        cwd=REPO,
        env=environment,
        check=False,
    )
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
