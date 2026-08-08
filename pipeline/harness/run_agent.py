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

The staticre MCP backend can run locally (`uv run`, the default) or inside the
container image (`--mcp docker`), which takes the ROM as a mounted input.

Usage:
  python pipeline/harness/run_agent.py --rom pipeline/raw_rom/breakout.gb
  python pipeline/harness/run_agent.py --rom <rom> --engine codex
  python pipeline/harness/run_agent.py --rom <rom> --mcp docker
  python pipeline/harness/run_agent.py --rom <rom> --dry-run
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent   # .../grokathon/pipeline
REPO = PIPELINE.parent                               # .../grokathon
STATIC_DIR = PIPELINE / "static"
SKILL = REPO / ".claude" / "skills" / "static-re" / "SKILL.md"


def _blind_rom(rom: Path, dest_dir: Path) -> dict:
    """Reuse the harness blinding so the agent never sees the real name/title."""
    sys.path.insert(0, str(STATIC_DIR / "src"))
    from staticre import blind

    return blind.prepare_binary(rom, dest_dir)


def _uv_bin() -> str:
    return shutil.which("uv") or os.path.expanduser("~/.local/bin/uv")


def _mcp_invocation(mcp: str, image: str, rom_path: Path, workdir: Path):
    """Return (command, args, env) for launching the staticre MCP server.

    `local` runs it via uv on the host; `docker` runs it in the container
    image with the ROM bind-mounted read-only and the Ghidra project persisted
    to a mounted workdir. Both speak the same stdio MCP protocol to the agent.
    """
    if mcp == "docker":
        command = shutil.which("docker") or "docker"
        args = [
            "run", "--rm", "-i",
            "-v", f"{rom_path}:/rom.gb:ro",
            "-v", f"{workdir}:/work",
            image, "mcp",
        ]
        return command, args, {}  # ROM/workdir/Ghidra paths are baked into the image
    ghidra_dir = next((PIPELINE / "tools").glob("ghidra_*_PUBLIC"), None)
    env = {"STATICRE_ROM": str(rom_path), "STATICRE_WORKDIR": str(workdir)}
    if ghidra_dir:
        env["GHIDRA_INSTALL_DIR"] = str(ghidra_dir)
    return _uv_bin(), ["run", "--project", str(STATIC_DIR), "staticre-mcp"], env


def _toml_str_array(items: list[str]) -> str:
    return "[" + ", ".join(f'"{i}"' for i in items) + "]"


def _write_grok_config(ws: Path, command: str, args: list[str], env: dict):
    cfg = ws / ".grok" / "config.toml"
    cfg.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "[mcp_servers.staticre]",
        f'command = "{command}"',
        f"args = {_toml_str_array(args)}",
        "enabled = true",
    ]
    if env:
        lines.append("")
        lines.append("[mcp_servers.staticre.env]")
        lines += [f'{k} = "{v}"' for k, v in env.items()]
    cfg.write_text("\n".join(lines) + "\n")
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
    ws = PIPELINE / "workspaces" / slug
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
               command: str, args: list[str], env: dict,
               effort: str | None, tier: str | None) -> list[str]:
    # Keep the user's real CODEX_HOME (auth + model defaults) and inject the
    # MCP server plus per-run overrides via inline `-c` TOML paths.
    cmd = [
        shutil.which("codex") or "codex", "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C", str(ws),
        "-c", f'mcp_servers.staticre.command="{command}"',
        "-c", f"mcp_servers.staticre.args={_toml_str_array(args)}",
    ]
    for k, v in env.items():
        cmd += ["-c", f'mcp_servers.staticre.env.{k}="{v}"']
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
    ap.add_argument("--mcp", choices=["local", "docker"], default="local",
                    help="run the staticre MCP backend on the host (local) or in the container image (docker)")
    ap.add_argument("--image", default="staticre:local",
                    help="container image to use with --mcp docker")
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

    mcp_command, mcp_args, mcp_env = _mcp_invocation(
        args.mcp, args.image, rom_path, workdir)

    shutil.copy(SKILL, ws / "static_re.md")
    _write_grok_config(ws, mcp_command, mcp_args, mcp_env)
    _write_task(ws, binfo["program_id"])

    (ws / "run_meta.json").write_text(
        __import__("json").dumps(
            {
                "created": datetime.now(timezone.utc).isoformat(),
                "engine": args.engine,
                "model": args.model,
                "effort": args.effort,
                "tier": args.tier,
                "mcp": args.mcp,
                "image": args.image if args.mcp == "docker" else None,
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
        cmd = _codex_cmd(ws, prompt, args.model, mcp_command, mcp_args, mcp_env,
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
