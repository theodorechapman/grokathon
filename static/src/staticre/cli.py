"""CLI: `staticre smoke <rom>` exercises the tool surface; `staticre serve <rom>`
speaks JSON-lines on stdin/stdout ({"id", "op", "params"} -> {"id", "ok", ...})
so an MCP layer or orchestrator can drive it without re-paying JVM startup.
"""

from __future__ import annotations

import argparse
import json
import sys


def _print(label, obj):
    print(f"\n=== {label} ===")
    print(json.dumps(obj, indent=2, default=str))


def smoke(rom: str, workdir: str):
    from .api import StaticAnalysis

    sa = StaticAnalysis(rom, workdir=workdir)
    try:
        info = sa.program_info()
        _print("program_info", info)
        _print("memory_map", sa.memory_map())
        _print("entry_points", sa.entry_points())

        funcs = sa.list_functions(limit=10)
        _print("list_functions (first 10)", funcs)

        if info["entry_points"]:
            entry = info["entry_points"][0]["canonical"]
            _print(f"disassemble {entry} (10)", sa.disassemble(entry, 10))

        if funcs["functions"]:
            target = funcs["functions"][0]["address"]["canonical"]
            _print(f"get_function {target}", sa.get_function(target))
            _print(f"decompile {target}", sa.decompile(target))
            _print(f"xrefs {target}", sa.xrefs(target))
            _print(f"callers {target}", sa.callers(target))
            _print(f"callees {target}", sa.callees(target))
            _print(
                "annotate (smoke)",
                sa.annotate(
                    {"kind": "function", "address": target},
                    {"comment": "smoke-test annotation", "tags": ["smoke"],
                     "confidence": 0.5},
                    evidence=["smoke test ran"],
                ),
            )

        _print("list_strings", sa.list_strings(limit=10))
    finally:
        sa.close()


def serve(rom: str, workdir: str):
    from .api import StaticAnalysis

    sa = StaticAnalysis(rom, workdir=workdir)
    sys.stderr.write(f"ready {sa.program_id}\n")
    sys.stderr.flush()
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                result = sa.dispatch(req["op"], req.get("params") or {})
                resp = {"id": req.get("id"), "ok": True, "result": result}
            except Exception as e:
                resp = {"id": req.get("id") if isinstance(req, dict) else None,
                        "ok": False, "error": str(e)}
            sys.stdout.write(json.dumps(resp, default=str) + "\n")
            sys.stdout.flush()
    finally:
        sa.close()


def main():
    ap = argparse.ArgumentParser(prog="staticre")
    ap.add_argument("command", choices=["smoke", "serve"])
    ap.add_argument("rom")
    ap.add_argument("--workdir", default="work")
    args = ap.parse_args()
    if args.command == "smoke":
        smoke(args.rom, args.workdir)
    else:
        serve(args.rom, args.workdir)


if __name__ == "__main__":
    main()
