"""MCP server exposing the staticre semantic API.

Wraps one StaticAnalysis instance (one binary per server). The target ROM
comes from argv or the STATICRE_ROM env var; the agent never sees the
original path — only blinded program metadata.

The Ghidra JVM is started eagerly in main() on the true main thread before
the async MCP loop begins (PyGhidra/JPype deadlocks if the JVM is first
started from inside an async tool handler on macOS). Startup takes ~1 min the
first time (mostly JVM boot; analysis of a small ROM is seconds); every tool
call afterwards is fast. All Ghidra access is serialized behind a lock.
"""

from __future__ import annotations

import os
import sys
import threading

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("staticre")

_lock = threading.Lock()
_sa = None


def _api():
    global _sa
    with _lock:
        if _sa is None:
            from .api import StaticAnalysis

            rom = os.environ.get("STATICRE_ROM") or (sys.argv[1] if len(sys.argv) > 1 else None)
            if not rom:
                raise RuntimeError("no ROM configured: pass a path or set STATICRE_ROM")
            workdir = os.environ.get("STATICRE_WORKDIR", "work")
            _sa = StaticAnalysis(rom, workdir=workdir)
        return _sa


def _call(op: str, **params):
    api = _api()
    with _lock:
        return api.dispatch(op, params)


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
    # Initialize Ghidra eagerly on the true main thread, BEFORE the async MCP
    # loop starts. PyGhidra/JPype must start the JVM on the main thread; doing
    # it lazily inside an async tool handler deadlocks on macOS (the JVM
    # startup thread-join blocks against the event loop). This makes startup
    # take ~1-2 min once, after which every tool call is fast.
    print("staticre: initializing Ghidra analysis (first run ~1-2 min)...",
          file=sys.stderr, flush=True)
    _api()
    print("staticre: analysis ready; serving MCP.", file=sys.stderr, flush=True)
    mcp.run()


if __name__ == "__main__":
    main()
