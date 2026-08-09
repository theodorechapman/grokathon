#!/usr/bin/env python3
"""Verify board-I/O fixtures against exported static and runtime evidence."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ECU = ROOT.parents[2]
E2E = ECU / "e2e-analysis"
ACCURACY = ROOT.parent / "accuracy-xdata"
ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def verify_line_limits() -> None:
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        require(len(lines) < 250, f"{path.relative_to(ROOT)} has {len(lines)} lines")


def instruction_index(model: dict) -> dict[str, str]:
    return {
        item["address"].split(":")[1]: item["text"]
        for function in model["functions"]
        for item in function["instructions"]
    }


def verify_xdata_reads(instructions: dict[str, str]) -> None:
    expected = {
        "5cea": "MOVX A,@R0",
        "5ceb": "XRL A,#0x1e",
        "5ced": "MOV CY,0xe0",
        "5cef": "JNC 0x5d0a",
        "33a5": "MOVX A,@R0",
        "33a6": "XRL A,#0x1e",
        "33a8": "ANL A,0x2e",
        "33aa": "MOV 0x20,A",
        "33ae": "MOVX A,@R0",
        "33af": "XRL A,#0x2",
        "33b1": "MOV 0x21,A",
        "9099": "MOVX A,@R0",
        "909a": "XRL A,#0x1e",
        "909c": "MOV 0x20,A",
        "90a0": "MOVX A,@R0",
        "90a1": "XRL A,#0x2",
        "90a3": "MOV 0x21,A",
        "65bb": "JB 0x09,0x65df",
        "315a": "MOVX A,@DPTR",
        "315e": "JB 0xe6,0x317c",
        "316e": "MOVX A,@DPTR",
        "316f": "JB 0xe6,0x317c",
    }
    for pc, text in expected.items():
        require(instructions.get(pc) == text, f"{pc} changed: {instructions.get(pc)}")


def verify_port_branches(instructions: dict[str, str], model: dict) -> None:
    expected = {
        "2282": "JB 0xb4,0x2287",
        "2540": "JB 0xb4,0x2545",
        "5cb9": "JNB 0xfa,0x5cc1",
        "230c": "JB 0xfc,0x2315",
        "2625": "JB 0xfc,0x262e",
        "2c66": "JB 0xfc,0x2c6f",
        "320e": "JNB 0xfb,0x3279",
        "34a1": "JNB 0xfb,0x34aa",
        "3505": "JNB 0xfb,0x3510",
        "9702": "JNB 0xf8,0x9708",
        "9c36": "JNB 0xf8,0x9c65",
    }
    for pc, text in expected.items():
        require(instructions.get(pc) == text, f"port branch {pc} changed")
    p6_references = [
        ref
        for function in model["functions"]
        for ref in function["references"]
        if ref["to"] == "SFR:00db"
    ]
    require(not p6_references, "canonical model gained a direct P6 reference")


def verify_runtime() -> None:
    strict = (ACCURACY / "runtime-strict-zero-reset.log").read_text(encoding="utf-8")
    approximate = (
        ACCURACY / "runtime-combined-approx-zero.log"
    ).read_text(encoding="utf-8")
    require(
        "op=W addr=a040 pc=5c1c value=ff class=output-latch" in strict,
        "startup A040 write evidence absent",
    )
    require(
        "op=R addr=a040 pc=5cea value=00 class=input-status" in strict,
        "independent A040 read evidence absent",
    )
    require(
        "read_pc=5cea addr=a040 value=00 branch_pc=5cef next_pc=5d0a"
        in approximate,
        "zero-valued startup branch outcome absent",
    )


def verify_scenarios(fixtures: dict) -> None:
    by_name = {item["name"]: item for item in fixtures["scenarios"]}
    require(
        set(by_name)
        == {"key-on", "crank", "idle", "part-load", "wot", "overrun", "fault-inputs"},
        "scenario set changed",
    )
    require(by_name["key-on"]["events"][0] == {
        "cycle": 4096, "target": "a040", "value": "00"
    }, "key-on release changed")
    require(by_name["crank"]["events"][1:3] == [
        {"cycle": 8192, "target": "p3", "value": "ef"},
        {"cycle": 12288, "target": "p3", "value": "ff"},
    ], "crank-context P3.4 window changed")
    for name in ("idle", "part-load", "wot", "overrun"):
        require(by_name[name]["defaults"]["a040"] == "41", f"{name} wait byte")
        require(by_name[name]["events"][0]["value"] == "40", f"{name} release byte")
    require(by_name["fault-inputs"]["defaults"]["a040"] == "01", "fault gate changed")


def verify_negative_alias_gate(semantics: dict) -> None:
    source = (ROOT / "src/motronic175-signal-provider.cpp").read_text(encoding="utf-8")
    patch = (ROOT / "patches/accuracy-xdata-signals.patch").read_text(encoding="utf-8")
    require("output_latch" not in source, "provider acquired output-latch state")
    require("write_xdata" not in source, "provider acquired a write-back API")
    added = "\n".join(line[1:] for line in patch.splitlines() if line.startswith("+"))
    require("m_signals.read_xdata(address" in added, "patch lacks signal read path")
    require(
        "return m_output_latches" not in added,
        "patch aliases output latch into input reads",
    )
    write_entries = [
        item for item in semantics["xdata"] if item["access"] == "write"
    ]
    require(write_entries[0].get("negative_gate"), "fixture lost aliasing gate")


def main() -> None:
    verify_line_limits()
    model = load(E2E / "program-model.json")
    semantics = load(ROOT / "fixtures/access-semantics.json")
    scenarios = load(ROOT / "fixtures/scenarios.json")
    require(semantics["canonical_rom_sha256"] == ROM_SHA256, "ROM identity changed")
    instructions = instruction_index(model)
    verify_xdata_reads(instructions)
    verify_port_branches(instructions, model)
    verify_runtime()
    verify_scenarios(scenarios)
    verify_negative_alias_gate(semantics)
    print("PASS: static PCs, runtime branch, scenarios, P6 boundary, alias gate")


if __name__ == "__main__":
    main()
