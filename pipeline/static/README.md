# staticre — semantic static-analysis API over PyGhidra

Thin JSON API over Ghidra 11.4.2 + GhidraBoy for SM83 / Game Boy binaries.
The agent sees functions, instructions, xrefs, memory regions, and symbols —
never Ghidra internals. See the repo plan for the design rationale.

## Setup

One-time (from repo root):

1. Ghidra 11.4.2 + GhidraBoy live in `tools/ghidra_11.4.2_PUBLIC/` (gitignored).
   To recreate:

   ```sh
   mkdir -p tools && cd tools
   curl -LO https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip
   curl -LO https://github.com/Gekkio/GhidraBoy/releases/download/20250830/ghidra_11.4.2_PUBLIC_20250830_GhidraBoy.zip
   unzip ghidra_11.4.2_PUBLIC_20250826.zip
   unzip ghidra_11.4.2_PUBLIC_20250830_GhidraBoy.zip -d ghidra_11.4.2_PUBLIC/Ghidra/Extensions/
   ```

   Pinned to 11.4.2 because GhidraBoy (archived 2026-06) supports up to that
   release; PyGhidra is pinned to the bundled 2.2.1 for the same reason.
   Requires JDK 21.

2. `cd static && uv sync`

`GHIDRA_INSTALL_DIR` is auto-detected from `tools/` if unset.

## Usage

```sh
uv run staticre smoke ../raw_rom/breakout.gb    # exercise every op
uv run staticre serve ../raw_rom/breakout.gb    # JSON-lines request/response
```

Serve protocol (one JSON object per line on stdin/stdout):

```json
{"id": 1, "op": "static.get_function", "params": {"address": "ROM:0150"}}
{"id": 1, "ok": true, "result": {...}}
```

First run imports + auto-analyzes into `work/ghidra_projects/` (slow);
later runs reopen the saved project.

## Tool surface (v0)

| op | purpose |
|---|---|
| `static.program_info` | orientation: processor, entry points, counts |
| `static.memory_map` | regions with semantic `kind` (rom/vram/work_ram/io/…) |
| `static.entry_points` | entry addresses |
| `static.list_functions` | paginated summaries (never decompiler output) |
| `static.get_function` | overview incl. `referenced_memory` reads/writes |
| `static.disassemble` | structured instructions + rendered text |
| `static.decompile` | derived interpretation; disassembly is authoritative |
| `static.xrefs` | bidirectional refs with read/write/call typing |
| `static.callers` / `static.callees` | local call graph, optional depth |
| `static.list_strings` | defined strings with xrefs |
| `static.create_function` | define a function auto-analysis missed |
| `static.annotate` | one mutation endpoint: name/comment → Ghidra; tags/confidence/evidence → sidecar |

Addresses are always objects (`{"space": "WRAM", "offset": "0xc120"}` or
canonical `"WRAM:c120"`), never bare integers. Hard caps: 100 functions,
200 instructions, 200 xrefs, 100 strings, 20 KB decompilation per call.

Every name carries `name_source`: `loader` | `ghidra_analysis` |
`ghidra_generated` | `agent` — the agent always knows whether a name is
evidence or its own inference.

## Blinding

The harness never shows the agent the original filename or ROM header title:
`blind.py` copies the ROM to `work/program-<sha12>.gb`, zeroes the title
field, and fixes both checksums. Program IDs are content-addressed. Serious
anti-memorization (ROM mutation, custom test ROMs) is deferred to the
benchmark phase.

## Sidecar metadata

`work/<program_id>.meta.json` holds what Ghidra shouldn't: tags, confidence,
immutable evidence records (`obs-NNNN`), and full annotation history. This is
the substrate for the later static→dynamic hypothesis handoff.
