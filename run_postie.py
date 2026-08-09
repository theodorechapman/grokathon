#!/usr/bin/env python3
"""Launch a full Postie reverse-engineering run.

Run from anywhere:

    python3 run_postie.py

The generated workspace is written to ``pipeline/workspaces/`` by default.
Codex runs in the agent container. ``--engine grok`` runs the headless Grok
Build CLI on the host so it uses the current user's local Grok credential.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parent
DEFAULT_ROM = REPO / "pipeline" / "raw_rom" / "postie.gbc"
DEFAULT_OUTPUT = REPO / "pipeline" / "workspaces"
DOCKER_RUNNER = REPO / "pipeline" / "harness" / "docker" / "run.sh"
HARNESS_RUNNER = REPO / "pipeline" / "harness" / "run_agent.py"


def grok_is_authenticated(executable: str) -> bool:
    """Ask Grok Build to validate its local credential without starting an agent."""
    check = subprocess.run(
        [executable, "models"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return check.returncode == 0 and "not authenticated" not in check.stdout.lower()


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
        help="codex uses Docker; grok uses the locally authenticated headless Grok Build CLI",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="model override (Codex defaults to gpt-5.6-sol; Grok uses local configuration)",
    )
    parser.add_argument("--effort", default="high")
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
    model = args.model or ("gpt-5.6-sol" if args.engine == "codex" else None)
    environment = os.environ.copy()

    print(f"ROM:       {rom}", flush=True)
    print(f"Workspaces: {output_dir}", flush=True)
    print(
        f"Agent:     {args.engine} / {model or 'local default'} / {args.effort}",
        flush=True,
    )
    print(f"Passes:    {args.max_passes or 'unlimited'}", flush=True)

    if args.engine == "grok":
        grok_executable = shutil.which("grok")
        if grok_executable is None:
            raise SystemExit("Grok Build CLI not found on PATH")
        if not (Path.home() / ".grok" / "auth.json").is_file():
            raise SystemExit("Local Grok credential not found; run `grok login` first")
        if not grok_is_authenticated(grok_executable):
            raise SystemExit("Local Grok credential is expired or invalid; run `grok login --oauth`")
        command = [
            sys.executable,
            str(HARNESS_RUNNER),
            "--rom", str(rom),
            "--engine", "grok",
            "--mcp", "local",
            "--workspaces-dir", str(output_dir),
            "--label", args.label,
            "--effort", args.effort,
            "--max-passes", str(args.max_passes),
        ]
        if model:
            command += ["--model", model]
        print("Auth:      local ~/.grok credential", flush=True)
    else:
        environment.update(
            {
                "ENGINE": "codex",
                "MODEL": model or "gpt-5.6-sol",
                "EFFORT": args.effort,
                "TIER": args.tier,
                "LABEL": args.label,
                "MAX_PASSES": str(args.max_passes),
            }
        )
        command = [str(DOCKER_RUNNER), str(rom), str(output_dir)]
        print(f"Tier:      {args.tier}", flush=True)

    completed = subprocess.run(
        command,
        cwd=REPO,
        env=environment,
        check=False,
    )
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
