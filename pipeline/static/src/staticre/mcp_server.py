"""MCP server exposing the staticre semantic API.

Wraps one StaticAnalysis instance (one binary per server). The target ROM
comes from argv or the STATICRE_ROM env var; the agent never sees the
original path — only blinded program metadata.

Architecture: the Ghidra JVM does NOT live in this process. Embedding PyGhidra
in the async MCP event loop deadlocks (JPype's JVM-startup thread-join blocks
against the loop). Instead this server spawns the tested `staticre serve`
subprocess (plain JSON-lines over a pipe, JVM embedded there on its own main
thread) and proxies each tool call to it. The MCP `initialize` handshake
answers instantly; only the first tool call waits for the backend's one-time
JVM boot + analysis (a few seconds), then every call is fast.
"""

from __future__ import annotations

import itertools
import json
import os
import subprocess
import sys
import threading

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("staticre")

_lock = threading.Lock()
_proc: subprocess.Popen | None = None
_ids = itertools.count(1)


def _drain_stderr(proc: subprocess.Popen):
    # Surface backend/Ghidra logs on our stderr so they land in the run log.
    for line in proc.stderr:
        sys.stderr.write(f"[backend] {line}")
        sys.stderr.flush()


def _ensure_backend():
    global _proc
    if _proc is not None and _proc.poll() is None:
        return _proc
    rom = os.environ.get("STATICRE_ROM") or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not rom:
        raise RuntimeError("no ROM configured: pass a path or set STATICRE_ROM")
    workdir = os.environ.get("STATICRE_WORKDIR", "work")
    _proc = subprocess.Popen(
        [sys.executable, "-m", "staticre.cli", "serve", rom, "--workdir", workdir],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1, env=os.environ.copy(),
    )
    threading.Thread(target=_drain_stderr, args=(_proc,), daemon=True).start()
    return _proc


def _call(op: str, **params):
    # Proxy one request to the `staticre serve` backend over its pipe. Blocking
    # pipe I/O is safe here: no JVM lives in this process, so there is no
    # cross-thread deadlock; the backend serializes work itself.
    with _lock:
        proc = _ensure_backend()
        req = {"id": next(_ids), "op": op, "params": params}
        proc.stdin.write(json.dumps(req) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline()
        if not line:
            code = proc.poll()
            extra = f" (backend exited with code {code})" if code is not None else ""
            raise RuntimeError(f"staticre backend closed the connection{extra}")
        resp = json.loads(line)
        if not resp.get("ok"):
            raise RuntimeError(resp.get("error", "unknown backend error"))
        return resp["result"]


@mcp.tool()
def program_info() -> dict:
    """Orientation: processor, entry points, memory/function/data counts.

    Call this first. The binary is identified only by a content hash."""
    return _call("static.program_info")


@mcp.tool()
def memory_map() -> dict:
    """List memory regions with semantic kind (rom, vram, work_ram, io, oam,
    hram, save_ram) and permissions. These region names are the address
    spaces used everywhere else."""
    return _call("static.memory_map")


@mcp.tool()
def entry_points() -> dict:
    """List program entry point addresses."""
    return _call("static.entry_points")


@mcp.tool()
def list_functions(limit: int = 50, cursor: str | None = None) -> dict:
    """Paginated function summaries (address, name, name_source, size,
    caller/callee counts). Cheap scan of the whole program; use get_function
    for detail. name_source tells you whether a name is evidence (loader),
    heuristic (ghidra_*), or your own inference (agent)."""
    return _call("static.list_functions", limit=limit, cursor=cursor)


@mcp.tool()
def get_function(address: str) -> dict:
    """Function overview: bounds, callers, callees, and referenced_memory
    (reads/writes with symbols) — the fastest way to hypothesize what a
    function does. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    return _call("static.get_function", address=address)


@mcp.tool()
def disassemble(start: str, instruction_count: int = 40) -> dict:
    """Structured disassembly from an address: per-instruction bytes,
    mnemonic, operands, control flow, and typed memory references, plus a
    rendered text listing. The disassembly is the authoritative view of the
    code. Max 200 instructions per call. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    return _call("static.disassemble", start=start, instruction_count=instruction_count)


@mcp.tool()
def decompile(function: str, timeout_seconds: int = 10) -> dict:
    """Decompile a function to C-like pseudocode. Treat the output as a
    derived interpretation (one observation), not ground truth — the
    disassembly is authoritative, and this decompiler is known to struggle
    with some instructions on this architecture. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    return _call("static.decompile", function=function, timeout_seconds=timeout_seconds)


@mcp.tool()
def xrefs(address: str, direction: str = "both", limit: int = 100) -> dict:
    """Cross-references to/from an address, typed read/write/call/jump/data,
    each tagged with the containing function. The key tool for tracing which
    code touches a memory location. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    return _call("static.xrefs", address=address, direction=direction, limit=limit)


@mcp.tool()
def callers(function: str, depth: int = 1) -> dict:
    """Caller graph (nodes+edges) around a function, up to depth. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    return _call("static.callers", function=function, depth=depth)


@mcp.tool()
def callees(function: str, depth: int = 1) -> dict:
    """Callee graph (nodes+edges) around a function, up to depth. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    return _call("static.callees", function=function, depth=depth)


@mcp.tool()
def list_strings(limit: int = 50, cursor: str | None = None) -> dict:
    """Defined strings with their xrefs. Note: games often store text as
    custom tile indices, so an empty result does not mean there is no text."""
    return _call("static.list_strings", limit=limit, cursor=cursor)


@mcp.tool()
def create_function(address: str, name: str | None = None) -> dict:
    """Define a function at an address auto-analysis missed (e.g. code only
    reached via a jump). Disassembles there first if needed, then returns the
    function overview. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    return _call("static.create_function", address=address, name=name)


@mcp.tool()
def create_functions(seeds: list[str]) -> dict:
    """Bulk-recover bank-switched code. Pass runtime-resolved seed addresses —
    the emulator's call-target trace (`call_targets()`), each a "SPACEhex"
    string like "ROM5:4c00" — and this disassembles each and lets intra-bank
    flow-following define the rest, turning otherwise-invisible banked banks
    into real functions. Returns created addresses and before/after function
    counts. This is how you make banked code (ROM1..ROMn) analyzable; static
    analysis alone cannot resolve which bank a runtime call targets."""
    return _call("static.create_functions", seeds=seeds)


@mcp.tool()
def annotate(
    kind: str,
    address: str,
    name: str | None = None,
    comment: str | None = None,
    tags: list[str] | None = None,
    confidence: float | None = None,
    evidence: list[str] | None = None,
) -> dict:
    """Record a finding. kind is "function" or "data". name/comment are
    written into the program database; tags/confidence/evidence are stored in
    the immutable evidence sidecar. Always pass evidence: short factual
    statements ("ROM:1739 writes WRAM:c120", "reads JOYP then masks bit 1")
    justifying the annotation. Addresses are "SPACE:hex" strings (e.g. "ROM:0150", "WRAM:c120", "IO:ff40"); spaces come from memory_map. Never use bare integers."""
    changes = {}
    if name is not None:
        changes["name"] = name
    if comment is not None:
        changes["comment"] = comment
    if tags is not None:
        changes["tags"] = tags
    if confidence is not None:
        changes["confidence"] = confidence
    return _call(
        "static.annotate",
        target={"kind": kind, "address": address},
        changes=changes,
        evidence=evidence,
    )


def main():
    # Kick off the backend (JVM boot + analysis) now so it warms up while the
    # MCP handshake completes, but don't block the async loop on it — the first
    # tool call will wait for readiness if warmup hasn't finished yet.
    print("staticre: starting analysis backend...", file=sys.stderr, flush=True)
    try:
        _ensure_backend()
    except Exception as e:  # surface config errors but still serve
        print(f"staticre: backend start failed: {e}", file=sys.stderr, flush=True)
    mcp.run()


if __name__ == "__main__":
    main()
