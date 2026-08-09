#!/usr/bin/env python3
"""Launch a headless RE agent in a fresh, timestamped workspace.

Each run gets its own directory under workspaces/ containing:
  - .grok/config.toml   MCP config wiring in the staticre (Ghidra) server only
  - static_re.md        the reverse-engineering skill/instructions (copied in)
  - rom/<program>.gb    a blinded copy of the target ROM
  - ghidra_work/        the agent's private Ghidra project + evidence sidecar
  - src/                where the agent writes its raw-C (GBDK) reimplementation
  - TASK.md             the concrete task prompt
  - agent.log          full transcript of the headless run

The agent gets normal file tools (read/write/search/shell) plus exactly one
MCP server: staticre. When the grokboy emulator bridge is built
(pipeline/bin/libgrokboy.*), the task also includes a dynamic-verification
step and the dynamic_re.md skill is copied into the workspace.

The staticre MCP backend can run locally (`uv run`, the default) or inside the
container image (`--mcp docker`), which takes the ROM as a mounted input.

Usage:
  python pipeline/harness/run_agent.py --rom pipeline/raw_rom/breakout.gb
  python pipeline/harness/run_agent.py --rom <rom> --engine codex --dry-run
"""

from __future__ import annotations

import argparse
import json
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
DYNAMIC_SKILL = REPO / ".claude" / "skills" / "dynamic-re" / "SKILL.md"
RECONSTRUCTION_TEMPLATE = Path(__file__).resolve().parent / "RECONSTRUCTION_TEMPLATE.md"
BUILD_SCRIPT = Path(__file__).resolve().parent / "build_rom.sh"
EMULATOR_LIB = PIPELINE / "bin" / (
    "libgrokboy.dylib" if sys.platform == "darwin" else "libgrokboy.so"
)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from write_task import write_task  # noqa: E402


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
    # Prefer the local tools/ install; fall back to a baked env var (container).
    gh = str(ghidra_dir) if ghidra_dir else os.environ.get("GHIDRA_INSTALL_DIR")
    if gh:
        env["GHIDRA_INSTALL_DIR"] = gh
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


def _make_workspace(base: Path, label: str | None) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = f"{ts}-{label}" if label else ts
    ws = base / slug
    (ws / "src").mkdir(parents=True, exist_ok=True)
    (ws / "rom").mkdir(parents=True, exist_ok=True)
    (ws / "ghidra_work").mkdir(parents=True, exist_ok=True)
    return ws


def _grok_cmd(ws: Path, prompt: str, model: str | None,
              effort: str | None) -> list[str]:
    cmd = [
        shutil.which("grok") or "grok",
        "--trust",
        "--cwd", str(ws),
        "--permission-mode", "bypassPermissions",
        "--output-format", "streaming-json",
        "--disable-web-search",
    ]
    if model:
        cmd += ["--model", model]
    if effort:
        cmd += ["--reasoning-effort", effort]
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


INITIAL_PROMPT = (
    "Read TASK.md, static_re.md, and RECONSTRUCTION.md in this workspace, "
    "then carry out the task. Continue until you can write a justified "
    "terminal RUN_STATUS.json as specified by the task."
)


def _continuation_prompt(previous: dict) -> str:
    priority = str(previous.get("next_priority") or "the highest-impact open ledger item")
    return (
        "A previous pass left this causal reconstruction incomplete. Continue in "
        "the existing workspace; preserve and use its source, experiments, notes, "
        "Ghidra database, and emulator artifacts. Do not summarize the prior pass "
        "and do not restart broad reconnaissance. Attack this recorded priority "
        f"immediately: {priority}\n\n"
        "Then continue the evidence-model-implementation-comparison loop through "
        "the remaining reachable core behavior. Read TASK.md and RECONSTRUCTION.md "
        "for the stopping contract. Before yielding, replace RUN_STATUS.json."
    )


def _read_run_status(path: Path) -> dict:
    """Read the agent-owned status declaration, normalizing malformed output."""
    if not path.exists():
        return {
            "status": "incomplete",
            "summary": "agent pass ended without RUN_STATUS.json",
            "next_priority": "audit the existing ledger and continue its highest-impact open item",
            "blockers": [],
        }
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "status": "incomplete",
            "summary": f"invalid RUN_STATUS.json: {exc}",
            "next_priority": "repair the status file, then continue the highest-impact open item",
            "blockers": [],
        }
    if not isinstance(data, dict) or data.get("status") not in {
        "complete", "hard_blocked", "incomplete"
    }:
        return {
            "status": "incomplete",
            "summary": "RUN_STATUS.json has an unrecognized status",
            "next_priority": "audit the existing ledger and continue its highest-impact open item",
            "blockers": [],
        }
    data.setdefault("summary", "")
    data.setdefault("next_priority", "")
    data.setdefault("blockers", [])
    return data


def _agent_cmd(engine: str, ws: Path, prompt: str, model: str | None,
               command: str, args: list[str], env: dict,
               effort: str | None, tier: str | None) -> list[str]:
    if engine == "grok":
        return _grok_cmd(ws, prompt, model, effort)
    return _codex_cmd(ws, prompt, model, command, args, env, effort, tier)


def _write_meta(path: Path, meta: dict) -> None:
    path.write_text(json.dumps(meta, indent=2) + "\n")


def _run_passes(*, ws: Path, engine: str, model: str | None,
                mcp_command: str, mcp_args: list[str], mcp_env: dict,
                effort: str | None, tier: str | None, max_passes: int,
                env: dict, meta_path: Path, meta: dict) -> int:
    """Continue fresh agent passes until the agent declares a terminal state."""
    log = ws / "agent.log"
    status_path = ws / "RUN_STATUS.json"
    previous: dict | None = None
    pass_number = 0

    print(f"log:       {log}\n")
    with log.open("w") as lf:
        while max_passes == 0 or pass_number < max_passes:
            pass_number += 1
            prompt = INITIAL_PROMPT if previous is None else _continuation_prompt(previous)
            cmd = _agent_cmd(
                engine, ws, prompt, model, mcp_command, mcp_args, mcp_env,
                effort, tier,
            )
            if status_path.exists():
                status_path.unlink()

            started = datetime.now(timezone.utc)
            banner = f"\n===== agent pass {pass_number} started {started.isoformat()} =====\n"
            print(banner, end="")
            lf.write(banner)
            lf.flush()

            proc = subprocess.Popen(
                cmd, cwd=ws, env=env, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True,
            )
            assert proc.stdout is not None
            for line in proc.stdout:
                sys.stdout.write(line)
                lf.write(line)
                lf.flush()
            rc = proc.wait()
            finished = datetime.now(timezone.utc)
            status = _read_run_status(status_path)
            record = {
                "pass": pass_number,
                "started": started.isoformat(),
                "finished": finished.isoformat(),
                "duration_seconds": (finished - started).total_seconds(),
                "exit_code": rc,
                "declaration": status,
            }
            meta.setdefault("passes", []).append(record)
            _write_meta(meta_path, meta)

            result = status["status"]
            tail = (
                f"===== agent pass {pass_number} exited {rc}; "
                f"declared {result} =====\n"
            )
            print(tail, end="")
            lf.write(tail)
            lf.flush()

            if rc != 0:
                return rc
            if result == "complete":
                return 0
            if result == "hard_blocked":
                return 3
            previous = status

    message = (
        f"agent reached the {max_passes}-pass safety ceiling without declaring "
        "complete or hard_blocked"
    )
    print(message, file=sys.stderr)
    return 2


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
    ap.add_argument("--max-passes", type=int, default=8,
                    help="agent-pass safety ceiling; 0 continues without a ceiling (default: 8)")
    ap.add_argument("--label", default=None, help="optional workspace name suffix")
    ap.add_argument("--workspaces-dir", default=str(PIPELINE / "workspaces"),
                    help="root dir for run workspaces (mount this in the container)")
    ap.add_argument("--mcp", choices=["local", "docker"], default="local",
                    help="run the staticre MCP backend on the host (local) or in the container image (docker)")
    ap.add_argument("--image", default="staticre:local",
                    help="container image to use with --mcp docker")
    ap.add_argument("--dry-run", action="store_true",
                    help="scaffold the workspace and print the command, but do not launch")
    args = ap.parse_args()

    if args.max_passes < 0:
        ap.error("--max-passes must be zero or greater")

    rom = Path(args.rom).resolve()
    if not rom.exists():
        ap.error(f"ROM not found: {rom}")

    ws = _make_workspace(Path(args.workspaces_dir).resolve(), args.label)
    binfo = _blind_rom(rom, ws / "rom")
    rom_path = Path(binfo["path"]).resolve()
    workdir = (ws / "ghidra_work").resolve()

    mcp_command, mcp_args, mcp_env = _mcp_invocation(
        args.mcp, args.image, rom_path, workdir)

    shutil.copy(SKILL, ws / "static_re.md")
    shutil.copy(RECONSTRUCTION_TEMPLATE, ws / "RECONSTRUCTION.md")
    build_script = ws / "build_rom.sh"
    shutil.copy(BUILD_SCRIPT, build_script)
    build_script.chmod(0o755)
    _write_grok_config(ws, mcp_command, mcp_args, mcp_env)
    emulator = EMULATOR_LIB.exists()
    if emulator:
        shutil.copy(DYNAMIC_SKILL, ws / "dynamic_re.md")
        write_task(ws, binfo["program_id"],
                   agent_dir=PIPELINE / "agent", rom_path=rom_path)
    else:
        write_task(ws, binfo["program_id"])

    meta_path = ws / "run_meta.json"
    meta = {
        "created": datetime.now(timezone.utc).isoformat(),
        "engine": args.engine,
        "model": args.model,
        "effort": args.effort,
        "tier": args.tier,
        "max_passes": args.max_passes,
        "mcp": args.mcp,
        "emulator": emulator,
        "image": args.image if args.mcp == "docker" else None,
        "rom_source": str(rom),
        "program_id": binfo["program_id"],
        "sha256": binfo["sha256"],
        "sha256_original": binfo["sha256_original"],
        "passes": [],
    }
    _write_meta(meta_path, meta)

    env = os.environ.copy()
    cmd = _agent_cmd(
        args.engine, ws, INITIAL_PROMPT, args.model, mcp_command, mcp_args,
        mcp_env, args.effort, args.tier,
    )

    print(f"workspace: {ws}")
    print(f"program:   {binfo['program_id']}  (blinded from {rom.name})")
    print(f"engine:    {args.engine}")
    print(f"command:   {' '.join(cmd)}")

    if args.dry_run:
        print("\n[dry-run] workspace scaffolded; not launching agent.")
        return

    rc = _run_passes(
        ws=ws,
        engine=args.engine,
        model=args.model,
        mcp_command=mcp_command,
        mcp_args=mcp_args,
        mcp_env=mcp_env,
        effort=args.effort,
        tier=args.tier,
        max_passes=args.max_passes,
        env=env,
        meta_path=meta_path,
        meta=meta,
    )
    print(f"\nagent run exited with code {rc}")
    sys.exit(rc)


if __name__ == "__main__":
    main()
