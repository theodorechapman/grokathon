#!/usr/bin/env python3
"""Launch a headless RE agent in a fresh, timestamped workspace.

Each run gets its own directory under workspaces/ containing:
  - .grok/config.toml   MCP config wiring in the staticre (Ghidra) server only
  - static_re.md        the reverse-engineering skill/instructions (copied in)
  - rom/<program>.gb    a blinded copy of the target ROM
  - ghidra_work/        the agent's private Ghidra project + evidence sidecar
  - src/                where the agent writes its TypeScript reimplementation
  - TASK.md             the concrete task prompt
  - agent.log          full transcript of the headless run

The agent gets normal file tools (read/write/search/shell) plus exactly one
MCP server: staticre. Computer-use of the running game and live memory
inspection are added later as additional MCP servers.

Usage:
  python harness/run_agent.py --rom raw_rom/breakout.gb
  python harness/run_agent.py --rom raw_rom/breakout.gb --engine codex
  python harness/run_agent.py --rom raw_rom/breakout.gb --dry-run
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
STATIC_DIR = REPO / "static"
SKILL = REPO / ".claude" / "skills" / "static-re" / "SKILL.md"


def _blind_rom(rom: Path, dest_dir: Path) -> dict:
    """Reuse the harness blinding so the agent never sees the real name/title."""
    sys.path.insert(0, str(STATIC_DIR / "src"))
    from staticre import blind

    return blind.prepare_binary(rom, dest_dir)


def _uv_bin() -> str:
    return shutil.which("uv") or os.path.expanduser("~/.local/bin/uv")


def _write_grok_config(ws: Path, rom_path: Path, workdir: Path):
    cfg = ws / ".grok" / "config.toml"
    cfg.parent.mkdir(parents=True, exist_ok=True)
    ghidra_dir = next((REPO / "tools").glob("ghidra_*_PUBLIC"), None)
    cfg.write_text(
        "[mcp_servers.staticre]\n"
        f'command = "{_uv_bin()}"\n'
        "args = [\n"
        '    "run",\n'
        '    "--project",\n'
        f'    "{STATIC_DIR}",\n'
        '    "staticre-mcp",\n'
        "]\n"
        "enabled = true\n\n"
        "[mcp_servers.staticre.env]\n"
        f'STATICRE_ROM = "{rom_path}"\n'
        f'STATICRE_WORKDIR = "{workdir}"\n'
        + (f'GHIDRA_INSTALL_DIR = "{ghidra_dir}"\n' if ghidra_dir else "")
    )
    return cfg


def _write_task(ws: Path, program_id: str) -> Path:
    task = ws / "TASK.md"
    task.write_text(
        f"""# Task: reverse-engineer an unknown binary and reimplement it in TypeScript

You are analyzing an unknown program, `{program_id}`, through the `staticre`
MCP tools (Ghidra-backed static analysis of an SM83 / Game Boy binary). You do
NOT know what the program is — infer everything from evidence.

Read `static_re.md` in this workspace first; it documents the tools and the
workflow. Then:

1. Map the program: entry point, memory regions, functions.
2. Work function by function. For each, form an evidence-backed hypothesis
   about what it does, and record it with the `annotate` tool (name, comment,
   tags, confidence, and evidence statements).
3. As your understanding solidifies, write a faithful TypeScript
   reimplementation of the program's logic under `src/` in this workspace.
   Structure it so the CPU/memory model and the game logic are separable.
   Prefer clear, evidence-traceable code over cleverness; cite the source
   addresses (e.g. `// ROM:0150`) in comments.
4. Keep a running `NOTES.md` in this workspace summarizing the memory map you
   have recovered (which RAM addresses hold what) and open questions. These
   open questions are the handoff to later dynamic analysis.

Work autonomously. Do not ask for confirmation; proceed on the best available
evidence and note your uncertainty in confidence values and NOTES.md.
"""
    )
    return task


def _make_workspace(rom: Path, label: str | None) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = f"{ts}-{label}" if label else ts
    ws = REPO / "workspaces" / slug
    (ws / "src").mkdir(parents=True, exist_ok=True)
    (ws / "rom").mkdir(parents=True, exist_ok=True)
    (ws / "ghidra_work").mkdir(parents=True, exist_ok=True)
    return ws


def _grok_cmd(ws: Path, prompt: str, model: str | None) -> list[str]:
    cmd = [
        shutil.which("grok") or "grok",
        "--cwd", str(ws),
        "--permission-mode", "bypassPermissions",
        "--output-format", "streaming-json",
        "--disable-web-search",
    ]
    if model:
        cmd += ["--model", model]
    cmd += ["-p", prompt]
    return cmd


def _codex_cmd(ws: Path, prompt: str, model: str | None,
               rom_path: Path, workdir: Path,
               effort: str | None, tier: str | None) -> list[str]:
    # Keep the user's real CODEX_HOME (auth + model defaults) and inject the
    # MCP server plus per-run overrides via inline `-c` TOML paths.
    ghidra_dir = next((REPO / "tools").glob("ghidra_*_PUBLIC"), None)
    args_toml = f'["run","--project","{STATIC_DIR}","staticre-mcp"]'
    cmd = [
        shutil.which("codex") or "codex", "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C", str(ws),
        "-c", f'mcp_servers.staticre.command="{_uv_bin()}"',
        "-c", f"mcp_servers.staticre.args={args_toml}",
        "-c", f'mcp_servers.staticre.env.STATICRE_ROM="{rom_path}"',
        "-c", f'mcp_servers.staticre.env.STATICRE_WORKDIR="{workdir}"',
    ]
    if ghidra_dir:
        cmd += ["-c", f'mcp_servers.staticre.env.GHIDRA_INSTALL_DIR="{ghidra_dir}"']
    if model:
        cmd += ["-m", model]
    if effort:
        cmd += ["-c", f'model_reasoning_effort="{effort}"']
    if tier:
        cmd += ["-c", f'service_tier="{tier}"']
    cmd += [prompt]
    return cmd


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rom", required=True, help="path to target ROM")
    ap.add_argument("--engine", choices=["grok", "codex"], default="grok")
    ap.add_argument("--model", default=None, help="model id override")
    ap.add_argument("--effort", default=None,
                    help="reasoning effort override (e.g. low/medium/high)")
    ap.add_argument("--tier", default=None,
                    help="service tier override (codex only, e.g. fast/priority)")
    ap.add_argument("--label", default=None, help="optional workspace name suffix")
    ap.add_argument("--dry-run", action="store_true",
                    help="scaffold the workspace and print the command, but do not launch")
    args = ap.parse_args()

    rom = Path(args.rom).resolve()
    if not rom.exists():
        ap.error(f"ROM not found: {rom}")

    ws = _make_workspace(rom, args.label)
    binfo = _blind_rom(rom, ws / "rom")
    rom_path = Path(binfo["path"]).resolve()
    workdir = (ws / "ghidra_work").resolve()

    shutil.copy(SKILL, ws / "static_re.md")
    _write_grok_config(ws, rom_path, workdir)
    _write_task(ws, binfo["program_id"])

    (ws / "run_meta.json").write_text(
        __import__("json").dumps(
            {
                "created": datetime.now(timezone.utc).isoformat(),
                "engine": args.engine,
                "model": args.model,
                "effort": args.effort,
                "tier": args.tier,
                "rom_source": str(rom),
                "program_id": binfo["program_id"],
                "sha256": binfo["sha256"],
                "sha256_original": binfo["sha256_original"],
            },
            indent=2,
        )
    )

    prompt = "Read TASK.md and static_re.md in this workspace, then carry out the task."
    env = os.environ.copy()
    if args.engine == "grok":
        cmd = _grok_cmd(ws, prompt, args.model)
    else:
        cmd = _codex_cmd(ws, prompt, args.model, rom_path, workdir,
                         args.effort, args.tier)

    print(f"workspace: {ws}")
    print(f"program:   {binfo['program_id']}  (blinded from {rom.name})")
    print(f"engine:    {args.engine}")
    print(f"command:   {' '.join(cmd)}")

    if args.dry_run:
        print("\n[dry-run] workspace scaffolded; not launching agent.")
        return

    log = ws / "agent.log"
    print(f"log:       {log}\n")
    with log.open("w") as lf:
        proc = subprocess.Popen(cmd, cwd=ws, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            sys.stdout.write(line)
            lf.write(line)
            lf.flush()
        rc = proc.wait()
    print(f"\nagent exited with code {rc}")
    sys.exit(rc)


if __name__ == "__main__":
    main()
