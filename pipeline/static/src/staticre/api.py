"""Thin semantic static-analysis API over PyGhidra.

One StaticAnalysis instance wraps one Ghidra program. All methods take and
return plain JSON-able dicts; no Ghidra objects cross the boundary. Addresses
are always {"space", "offset", "canonical"} objects keyed to memory-block
names, never bare integers.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from . import blind

# Server-side hard caps (see plan §17)
MAX_FUNCTIONS = 100
MAX_INSTRUCTIONS = 200
MAX_XREFS = 200
MAX_STRINGS = 100
MAX_DECOMP_BYTES = 20 * 1024

_KIND_HINTS = [
    ("vram", "vram"),
    ("hram", "hram"),
    ("oam", "oam"),
    ("wram", "work_ram"),
    ("sram", "save_ram"),
    ("cart_ram", "save_ram"),
    ("xram", "save_ram"),
    ("io", "io"),
    ("reg", "io"),
    ("ie", "io"),
    ("rom", "rom"),
    ("boot", "rom"),
]


def _kind_for_block(name: str) -> str:
    low = name.lower()
    for hint, kind in _KIND_HINTS:
        if hint in low:
            return kind
    return "other"


class StaticAnalysis:
    """Owns a Ghidra project for a single (blinded) binary."""

    def __init__(self, rom_path: str, workdir: str = "work", analyze: bool = True):
        self.workdir = Path(workdir)
        self.binfo = blind.prepare_binary(rom_path, self.workdir)
        self.program_id = self.binfo["program_id"]
        self._meta_path = self.workdir / f"{self.program_id}.meta.json"
        self._meta = self._load_meta()

        self._ensure_ghidra_install_dir()
        import pyghidra

        pyghidra.start()

        # Java-side imports (valid only after pyghidra.start())
        from ghidra.program.model.symbol import SourceType
        from ghidra.program.model.listing import CodeUnit
        from ghidra.util.task import TaskMonitor
        from ghidra.app.decompiler.flatapi import FlatDecompilerAPI

        self._SourceType = SourceType
        self._CodeUnit = CodeUnit
        self._monitor = TaskMonitor.DUMMY

        self._ctx = pyghidra.open_program(
            self.binfo["path"],
            project_location=str(self.workdir / "ghidra_projects"),
            project_name=self.program_id,
            analyze=analyze,
        )
        self.flat = self._ctx.__enter__()
        self.program = self.flat.getCurrentProgram()
        self._decomp = FlatDecompilerAPI(self.flat)
        self._analysis_complete = analyze

    @staticmethod
    def _ensure_ghidra_install_dir():
        import os

        if os.environ.get("GHIDRA_INSTALL_DIR"):
            return
        for parent in [Path.cwd(), *Path.cwd().parents]:
            candidates = sorted((parent / "tools").glob("ghidra_*_PUBLIC"))
            if candidates:
                os.environ["GHIDRA_INSTALL_DIR"] = str(candidates[-1])
                return
        raise RuntimeError(
            "GHIDRA_INSTALL_DIR is not set and no tools/ghidra_*_PUBLIC "
            "install was found in any parent directory"
        )

    def close(self):
        try:
            self._decomp.dispose()
        except Exception:
            pass
        self._ctx.__exit__(None, None, None)

    # ------------------------------------------------------------------
    # Address handling
    # ------------------------------------------------------------------

    def _addr_json(self, addr) -> dict:
        block = self.program.getMemory().getBlock(addr)
        space = block.getName().upper() if block else addr.getAddressSpace().getName().upper()
        off = addr.getOffset()
        file_offset = None
        try:
            info = self.program.getMemory().getAddressSourceInfo(addr)
            if info is not None and info.getFileOffset() >= 0:
                file_offset = f"0x{info.getFileOffset():x}"
        except Exception:
            pass
        return {
            "space": space,
            "offset": f"0x{off:04x}",
            "canonical": f"{space}:{off:04x}",
            "file_offset": file_offset,
        }

    def _canon(self, addr) -> str:
        return self._addr_json(addr)["canonical"]

    def _parse_addr(self, a):
        """Accept {"space","offset"}, "SPACE:hex", or "0xhex"."""
        if isinstance(a, dict):
            space, off = a.get("space"), a["offset"]
        elif isinstance(a, str) and ":" in a:
            space, off = a.split(":", 1)
        else:
            space, off = None, a
        offset = int(str(off), 16) if isinstance(off, str) else int(off)

        if space:
            for block in self.program.getMemory().getBlocks():
                if block.getName().lower() == space.lower():
                    return block.getStart().getAddressSpace().getAddress(offset)
            raise ValueError(f"unknown memory space: {space}")

        addr = self.program.getAddressFactory().getDefaultAddressSpace().getAddress(offset)
        # Reject ambiguity: bare offsets are only allowed if exactly one
        # block (including overlays) could contain them.
        matches = [
            b for b in self.program.getMemory().getBlocks()
            if b.getStart().getOffset() <= offset <= b.getEnd().getOffset()
        ]
        if len(matches) > 1:
            names = [b.getName().upper() for b in matches]
            raise ValueError(
                f"ambiguous address 0x{offset:04x}; specify a space: {names}"
            )
        if matches:
            return matches[0].getStart().getAddressSpace().getAddress(offset)
        return addr

    def _name_source(self, symbol) -> str:
        if symbol is None:
            return "ghidra_generated"
        st = symbol.getSource()
        S = self._SourceType
        if st == S.USER_DEFINED:
            return "agent"
        if st == S.IMPORTED:
            return "loader"
        if st == S.ANALYSIS:
            return "ghidra_analysis"
        return "ghidra_generated"

    # ------------------------------------------------------------------
    # Sidecar metadata (tags/confidence/evidence live here, not in Ghidra)
    # ------------------------------------------------------------------

    def _load_meta(self) -> dict:
        if self._meta_path.exists():
            return json.loads(self._meta_path.read_text())
        return {"annotations": {}, "history": [], "evidence": []}

    def _save_meta(self):
        self._meta_path.write_text(json.dumps(self._meta, indent=2))

    # ------------------------------------------------------------------
    # Tool surface
    # ------------------------------------------------------------------

    def program_info(self) -> dict:
        p = self.program
        lang = p.getLanguage()
        entry_points = [
            self._addr_json(a) for a in p.getSymbolTable().getExternalEntryPointIterator()
        ]
        data_count = sum(1 for _ in p.getListing().getDefinedData(True))
        return {
            "program_id": self.program_id,
            "name": Path(self.binfo["path"]).name,
            "sha256": self.binfo["sha256"],
            "size": self.binfo["size"],
            "loader": p.getExecutableFormat(),
            "processor": str(lang.getProcessor()),
            "endianness": "big" if lang.isBigEndian() else "little",
            "pointer_size": lang.getDefaultSpace().getPointerSize(),
            "entry_points": entry_points,
            "memory_region_count": len(p.getMemory().getBlocks()),
            "function_count": p.getFunctionManager().getFunctionCount(),
            "defined_data_count": data_count,
            "analysis": {"complete": self._analysis_complete, "warnings": []},
        }

    def memory_map(self) -> dict:
        regions = []
        for b in self.program.getMemory().getBlocks():
            perms = "".join([
                "r" if b.isRead() else "",
                "w" if b.isWrite() else "",
                "x" if b.isExecute() else "",
            ])
            regions.append({
                "name": b.getName().upper(),
                "start": self._addr_json(b.getStart()),
                "end": self._addr_json(b.getEnd()),
                "size": b.getSize(),
                "permissions": perms,
                "kind": _kind_for_block(b.getName()),
                "initialized": b.isInitialized(),
            })
        return {"regions": regions}

    def entry_points(self) -> dict:
        return {
            "entry_points": [
                self._addr_json(a)
                for a in self.program.getSymbolTable().getExternalEntryPointIterator()
            ]
        }

    def list_functions(self, limit: int = 50, cursor: str | None = None) -> dict:
        limit = min(int(limit), MAX_FUNCTIONS)
        start = int(cursor) if cursor else 0
        fm = self.program.getFunctionManager()
        funcs = list(fm.getFunctions(True))  # sorted by entry point
        page = funcs[start:start + limit]
        out = []
        for f in page:
            body = f.getBody()
            callers = f.getCallingFunctions(self._monitor)
            callees = f.getCalledFunctions(self._monitor)
            sym = f.getSymbol()
            out.append({
                "address": self._addr_json(f.getEntryPoint()),
                "name": f.getName(),
                "name_source": self._name_source(sym),
                "size": body.getNumAddresses(),
                "callers": len(callers),
                "callees": len(callees),
            })
        next_cursor = str(start + limit) if start + limit < len(funcs) else None
        return {"functions": out, "total": len(funcs), "next_cursor": next_cursor}

    def _function_at(self, address):
        addr = self._parse_addr(address)
        fm = self.program.getFunctionManager()
        f = fm.getFunctionAt(addr) or fm.getFunctionContaining(addr)
        if f is None:
            raise ValueError(f"no function at {self._canon(addr)}")
        return f

    def get_function(self, address) -> dict:
        f = self._function_at(address)
        body = f.getBody()
        listing = self.program.getListing()
        symtab = self.program.getSymbolTable()

        reads, writes, other_refs = set(), set(), set()
        for ins in listing.getInstructions(body, True):
            for ref in ins.getReferencesFrom():
                rt = ref.getReferenceType()
                if rt.isCall() or rt.isJump():
                    continue
                target = ref.getToAddress()
                if not target.isMemoryAddress():
                    continue
                item = self._canon(target)
                sym = symtab.getPrimarySymbol(target)
                if sym is not None:
                    item = f"{item} ({sym.getName()})"
                if rt.isWrite():
                    writes.add(item)
                elif rt.isRead():
                    reads.add(item)
                else:
                    other_refs.add(item)

        callers = sorted(self._canon(c.getEntryPoint()) for c in f.getCallingFunctions(self._monitor))
        callees = sorted(self._canon(c.getEntryPoint()) for c in f.getCalledFunctions(self._monitor))

        canonical = self._canon(f.getEntryPoint())
        sidecar = self._meta["annotations"].get(canonical, {})
        return {
            "address": self._addr_json(f.getEntryPoint()),
            "name": f.getName(),
            "name_source": self._name_source(f.getSymbol()),
            "bounds": {
                "start": self._canon(body.getMinAddress()),
                "end": self._canon(body.getMaxAddress()),
            },
            "size": body.getNumAddresses(),
            "callers": callers,
            "callees": callees,
            "referenced_memory": {
                "reads": sorted(reads),
                "writes": sorted(writes),
                "other": sorted(other_refs),
            },
            "comment": f.getComment(),
            "user_metadata": {
                "tags": sidecar.get("tags", []),
                "confidence": sidecar.get("confidence"),
                "evidence_ids": sidecar.get("evidence_ids", []),
            },
        }

    def disassemble(self, start, instruction_count: int = 40) -> dict:
        count = min(int(instruction_count), MAX_INSTRUCTIONS)
        addr = self._parse_addr(start)
        listing = self.program.getListing()
        symtab = self.program.getSymbolTable()
        ins = listing.getInstructionAt(addr) or listing.getInstructionAfter(addr)

        instructions, rendered = [], []
        while ins is not None and len(instructions) < count:
            raw = bytes((b & 0xFF) for b in ins.getBytes())
            ft = ins.getFlowType()
            if ft.isCall():
                flow = "call"
            elif ft.isJump():
                flow = "jump_conditional" if ft.isConditional() else "jump"
            elif ft.isTerminal():
                flow = "return"
            else:
                flow = "fallthrough"
            refs = []
            for ref in ins.getReferencesFrom():
                rt = ref.getReferenceType()
                target = ref.getToAddress()
                if not target.isMemoryAddress():
                    continue
                if rt.isWrite():
                    rtype = "write"
                elif rt.isRead():
                    rtype = "read"
                elif rt.isCall():
                    rtype = "call"
                elif rt.isJump():
                    rtype = "jump"
                else:
                    rtype = "data"
                sym = symtab.getPrimarySymbol(target)
                refs.append({
                    "type": rtype,
                    "target": self._canon(target),
                    "symbol": sym.getName() if sym else None,
                })
            mnemonic = ins.getMnemonicString()
            n_ops = ins.getNumOperands()
            operands = ",".join(
                ins.getDefaultOperandRepresentation(i) for i in range(n_ops)
            )
            can = self._canon(ins.getAddress())
            instructions.append({
                "address": can,
                "bytes": raw.hex(" ").upper(),
                "mnemonic": mnemonic,
                "operands": operands,
                "flow": flow,
                "refs": refs,
            })
            rendered.append(f"{can}  {mnemonic} {operands}".rstrip())
            ins = ins.getNext()

        return {"instructions": instructions, "rendered": "\n".join(rendered)}

    def decompile(self, function, timeout_seconds: int = 10) -> dict:
        f = self._function_at(function)
        t0 = time.monotonic()
        try:
            code = self._decomp.decompile(f, int(timeout_seconds))
            code = str(code)
            truncated = len(code.encode()) > MAX_DECOMP_BYTES
            if truncated:
                code = code.encode()[:MAX_DECOMP_BYTES].decode(errors="replace")
            return {
                "function": self._canon(f.getEntryPoint()),
                "success": True,
                "code": code,
                "truncated": truncated,
                "note": "Decompiler output is a derived interpretation; the "
                        "disassembly is authoritative.",
                "elapsed_ms": int((time.monotonic() - t0) * 1000),
            }
        except Exception as e:  # decompiler failures are observations, not crashes
            return {
                "function": self._canon(f.getEntryPoint()),
                "success": False,
                "error": str(e),
                "elapsed_ms": int((time.monotonic() - t0) * 1000),
            }

    def xrefs(self, address, direction: str = "both", limit: int = 100) -> dict:
        limit = min(int(limit), MAX_XREFS)
        addr = self._parse_addr(address)
        rm = self.program.getReferenceManager()
        fm = self.program.getFunctionManager()

        def _ref_json(ref):
            rt = ref.getReferenceType()
            if rt.isWrite():
                rtype = "write"
            elif rt.isRead():
                rtype = "read"
            elif rt.isCall():
                rtype = "call"
            elif rt.isJump():
                rtype = "jump"
            else:
                rtype = "data"
            func = fm.getFunctionContaining(ref.getFromAddress())
            return {
                "from": self._canon(ref.getFromAddress()),
                "to": self._canon(ref.getToAddress()),
                "type": rtype,
                "function": self._canon(func.getEntryPoint()) if func else None,
                "function_name": func.getName() if func else None,
            }

        to_refs, from_refs = [], []
        if direction in ("both", "to"):
            for ref in rm.getReferencesTo(addr):
                to_refs.append(_ref_json(ref))
                if len(to_refs) >= limit:
                    break
        if direction in ("both", "from"):
            for ref in rm.getReferencesFrom(addr):
                from_refs.append(_ref_json(ref))
                if len(from_refs) >= limit:
                    break
        return {"address": self._canon(addr), "to": to_refs, "from": from_refs}

    def _call_graph(self, function, depth: int, direction: str) -> dict:
        f = self._function_at(function)
        nodes, edges, seen = {}, set(), set()
        frontier = [(f, 0)]
        while frontier:
            fn, d = frontier.pop()
            can = self._canon(fn.getEntryPoint())
            nodes[can] = {"address": can, "name": fn.getName(),
                          "name_source": self._name_source(fn.getSymbol())}
            if d >= depth or can in seen:
                continue
            seen.add(can)
            neighbors = (fn.getCallingFunctions(self._monitor) if direction == "callers"
                         else fn.getCalledFunctions(self._monitor))
            for n in neighbors:
                ncan = self._canon(n.getEntryPoint())
                edge = (ncan, can) if direction == "callers" else (can, ncan)
                edges.add(edge)
                frontier.append((n, d + 1))
        return {
            "root": self._canon(f.getEntryPoint()),
            "nodes": list(nodes.values()),
            "edges": [{"from": a, "to": b} for a, b in sorted(edges)],
        }

    def callers(self, function, depth: int = 1) -> dict:
        return self._call_graph(function, int(depth), "callers")

    def callees(self, function, depth: int = 1) -> dict:
        return self._call_graph(function, int(depth), "callees")

    def list_strings(self, limit: int = 50, cursor: str | None = None) -> dict:
        limit = min(int(limit), MAX_STRINGS)
        start = int(cursor) if cursor else 0
        rm = self.program.getReferenceManager()
        found = []
        for data in self.program.getListing().getDefinedData(True):
            if not data.hasStringValue():
                continue
            xr = [self._canon(r.getFromAddress()) for r in rm.getReferencesTo(data.getAddress())]
            found.append({
                "address": self._canon(data.getAddress()),
                "value": str(data.getValue()),
                "type": str(data.getDataType().getName()),
                "xrefs": xr,
            })
        page = found[start:start + limit]
        next_cursor = str(start + limit) if start + limit < len(found) else None
        return {"strings": page, "total": len(found), "next_cursor": next_cursor}

    def create_function(self, address, name: str | None = None) -> dict:
        """Define a function at an address auto-analysis missed (e.g. a
        jump-only entry). Disassembles there first if needed."""
        addr = self._parse_addr(address)
        fm = self.program.getFunctionManager()
        existing = fm.getFunctionAt(addr)
        if existing is not None:
            return {"created": False, "reason": "function already exists",
                    "function": self.get_function(self._canon(addr))}
        tx = self.program.startTransaction("agent create_function")
        try:
            listing = self.program.getListing()
            if listing.getInstructionAt(addr) is None:
                self.flat.disassemble(addr)
            f = self.flat.createFunction(addr, name)
            if f is None:
                raise ValueError(f"could not create function at {self._canon(addr)}")
            if name:
                f.setName(name, self._SourceType.USER_DEFINED)
            self.program.endTransaction(tx, True)
        except Exception:
            self.program.endTransaction(tx, False)
            raise
        return {"created": True, "function": self.get_function(self._canon(addr))}

    def create_functions(self, seeds: list) -> dict:
        """Bulk-define functions at runtime-recovered seed addresses (e.g. the
        call-target trace from the emulator), then let flow-following define
        the rest. Each seed is a canonical "SPACEhex" string or {space,offset}.
        Disassembly inside a bank overlay follows intra-bank flow, so a handful
        of seeds cascades into most of that bank's code. Returns per-seed
        outcomes and the resulting function count."""
        fm = self.program.getFunctionManager()
        before = fm.getFunctionCount()
        created, existing, failed = [], [], []
        tx = self.program.startTransaction("agent create_functions")
        try:
            listing = self.program.getListing()
            for seed in seeds:
                try:
                    addr = self._parse_addr(seed)
                except Exception as e:
                    failed.append({"seed": seed, "error": str(e)})
                    continue
                canonical = self._canon(addr)
                if fm.getFunctionAt(addr) is not None:
                    existing.append(canonical)
                    continue
                try:
                    if listing.getInstructionAt(addr) is None:
                        self.flat.disassemble(addr)
                    if self.flat.createFunction(addr, None) is not None:
                        created.append(canonical)
                    else:
                        failed.append({"seed": canonical, "error": "could not create"})
                except Exception as e:
                    failed.append({"seed": canonical, "error": str(e)})
            self.program.endTransaction(tx, True)
        except Exception:
            self.program.endTransaction(tx, False)
            raise
        return {
            "seeds": len(seeds),
            "created": created,
            "created_count": len(created),
            "already_existed": len(existing),
            "failed": failed,
            "function_count_before": before,
            "function_count_after": fm.getFunctionCount(),
        }

    def annotate(self, target: dict, changes: dict, evidence: list | None = None) -> dict:
        kind = target.get("kind", "function")
        addr = self._parse_addr(target["address"])
        canonical = self._canon(addr)
        S = self._SourceType

        previous = {}
        tx = self.program.startTransaction("agent annotation")
        try:
            if kind == "function":
                f = self._function_at(target["address"])
                previous["name"] = f.getName()
                previous["comment"] = f.getComment()
                if "name" in changes:
                    f.setName(changes["name"], S.USER_DEFINED)
                if "comment" in changes:
                    f.setComment(changes["comment"])
                canonical = self._canon(f.getEntryPoint())
            elif kind == "data":
                symtab = self.program.getSymbolTable()
                sym = symtab.getPrimarySymbol(addr)
                previous["name"] = sym.getName() if sym else None
                if "name" in changes:
                    if sym is not None and sym.getSource() == S.USER_DEFINED:
                        sym.setName(changes["name"], S.USER_DEFINED)
                    else:
                        symtab.createLabel(addr, changes["name"], S.USER_DEFINED)
                if "comment" in changes:
                    self.program.getListing().setComment(
                        addr, self._CodeUnit.EOL_COMMENT, changes["comment"]
                    )
            else:
                raise ValueError(f"unknown annotation target kind: {kind}")
            self.program.endTransaction(tx, True)
        except Exception:
            self.program.endTransaction(tx, False)
            raise

        # Sidecar: tags / confidence / evidence, plus immutable history
        evidence_ids = []
        for ev in evidence or []:
            eid = f"obs-{len(self._meta['evidence']):04d}"
            self._meta["evidence"].append(
                {"id": eid, "source": "static", "statement": ev, "target": canonical}
            )
            evidence_ids.append(eid)

        entry = self._meta["annotations"].setdefault(canonical, {})
        for key in ("tags", "confidence"):
            if key in changes:
                entry[key] = changes[key]
        if evidence_ids:
            entry.setdefault("evidence_ids", []).extend(evidence_ids)
        self._meta["history"].append({
            "target": canonical,
            "kind": kind,
            "changes": changes,
            "previous": previous,
            "evidence_ids": evidence_ids,
        })
        self._save_meta()

        return {
            "applied": True,
            "target": canonical,
            "previous": previous,
            "current": {k: changes.get(k, previous.get(k)) for k in ("name", "comment")},
            "evidence_ids": evidence_ids,
        }

    # Dispatch table for the serve/JSON layer
    OPS = {
        "static.program_info": "program_info",
        "static.memory_map": "memory_map",
        "static.entry_points": "entry_points",
        "static.list_functions": "list_functions",
        "static.get_function": "get_function",
        "static.disassemble": "disassemble",
        "static.decompile": "decompile",
        "static.xrefs": "xrefs",
        "static.callers": "callers",
        "static.callees": "callees",
        "static.list_strings": "list_strings",
        "static.create_function": "create_function",
        "static.create_functions": "create_functions",
        "static.annotate": "annotate",
    }

    def dispatch(self, op: str, params: dict):
        method = self.OPS.get(op)
        if method is None:
            raise ValueError(f"unknown op: {op}; available: {sorted(self.OPS)}")
        return getattr(self, method)(**(params or {}))
