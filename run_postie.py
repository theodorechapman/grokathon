#!/usr/bin/env python3
"""Launch a full Postie reverse-engineering run.

Run from anywhere:

    python3 run_postie.py

The generated workspace is written to ``pipeline/workspaces/`` by default.
Both engines run in the agent container. ``--engine grok`` uses the container's
Grok Build CLI with an ephemeral copy of the current user's local credential.
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


def engine_defaults(engine: str) -> tuple[str, str]:
    """Return the pinned model and effort for a reconstruction engine."""
    if engine == "grok":
        return "grok-4.5", "high"
    return "gpt-5.6-sol", "high"


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
    parser.add_argument(
        "--engine",
        choices=("codex", "grok"),
        default="codex",
        help="containerized agent engine (Grok uses an ephemeral copy of ~/.grok auth)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="model override (defaults: gpt-5.6-sol for Codex, grok-4.5 for Grok)",
    )
    parser.add_argument(
        "--effort",
        default=None,
        help="reasoning effort (defaults to high for both engines)",
    )
    parser.add_argument("--tier", default="fast")
    parser.add_argument("--label", default="postie-full")
    parser.add_argument(
        "--max-passes",
        type=int,
        default=8,
        help="agent-pass safety ceiling; 0 continues until terminal status (default: 8)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rom = args.rom.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()

    if not rom.is_file():
        raise SystemExit(f"ROM not found: {rom}")
    if not DOCKER_RUNNER.is_file():
        raise SystemExit(f"Docker runner not found: {DOCKER_RUNNER}")
    if args.max_passes < 0:
        raise SystemExit("--max-passes must be zero or greater")

    output_dir.mkdir(parents=True, exist_ok=True)
    default_model, default_effort = engine_defaults(args.engine)
    model = args.model or default_model
    effort = args.effort or default_effort
    environment = os.environ.copy()

    print(f"ROM:       {rom}", flush=True)
    print(f"Workspaces: {output_dir}", flush=True)
    print(
        f"Agent:     {args.engine} / {model} / {effort}",
        flush=True,
    )
    print(f"Passes:    {args.max_passes or 'unlimited'}", flush=True)

    if args.engine == "grok":
        if not (Path.home() / ".grok" / "auth.json").is_file():
            raise SystemExit("Local Grok credential not found; run `grok login` first")
        print("Auth:      ephemeral copy of local ~/.grok credential", flush=True)
        print("Mode:      Grok 4.5 / high reasoning", flush=True)
    else:
        print(f"Tier:      {args.tier}", flush=True)

    environment.update(
        {
            "ENGINE": args.engine,
            "MODEL": model,
            "EFFORT": effort,
            "TIER": args.tier if args.engine == "codex" else "",
            "LABEL": args.label,
            "MAX_PASSES": str(args.max_passes),
        }
    )
    command = [str(DOCKER_RUNNER), str(rom), str(output_dir)]

    completed = subprocess.run(
        command,
        cwd=REPO,
        env=environment,
        check=False,
    )
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
