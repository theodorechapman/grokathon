#!/usr/bin/env python3

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ROM_SIZE = 0xA000
ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
MAME_COMMIT = "a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
RESET_PATH = (0x0000, 0x0073, 0x0075, 0x0077, 0x0079, 0x007B, 0x20E0, 0x5C00)
PC_RE = re.compile(r"^CYC=(\d+)\s+([0-9a-f]{4}):", re.IGNORECASE | re.MULTILINE)
ACCESS_RE = re.compile(
    r"XDATA first op=([RW]) addr=([0-9a-f]{4}) pc=([0-9a-f]{4}) "
    r"value=([0-9a-f]{2}) class=([a-z0-9-]+) unknown=([01])",
    re.IGNORECASE,
)


def fail(message: str) -> None:
    raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_rom(path: Path) -> None:
    if not path.is_file():
        fail(f"canonical ROM is absent: {path}")
    if path.stat().st_size != ROM_SIZE:
        fail(f"ROM size is {path.stat().st_size:#x}, expected {ROM_SIZE:#x}")
    if digest(path) != ROM_SHA256:
        fail("canonical ROM SHA-256 mismatch")


def verify_sources() -> None:
    for path in [*ROOT.glob("*.py"), *ROOT.glob("*.sh"), *ROOT.glob("src/*")]:
        if path.is_file():
            lines = path.read_text(encoding="utf-8").splitlines()
            if len(lines) >= 250:
                fail(f"authored source exceeds 249 lines: {path.name} ({len(lines)})")


def ordered_subsequence(values: list[int], expected: tuple[int, ...]) -> None:
    position = 0
    for item in expected:
        try:
            position = values.index(item, position) + 1
        except ValueError:
            fail(f"ordered runtime path is missing PC {item:04x}")


def parse_accesses(text: str) -> list[tuple[str, str, str, str, str, str]]:
    return [
        tuple(value.lower() for value in match)
        for match in ACCESS_RE.findall(text)
    ]


def verify_artifact_hashes(summary: dict[str, object]) -> None:
    for case in ("model", "no-xram"):
        artifacts = summary["cases"][case]["artifacts"]
        for item in artifacts.values():
            path = ROOT / item["path"]
            if not path.is_file():
                fail(f"runtime artifact is absent: {path.name}")
            if path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
                fail(f"runtime artifact does not match summary: {path.name}")


def verify_trace(case: str, summary: dict[str, object]) -> tuple[list[int], str]:
    trace_path = ROOT / f"runtime-{case}-trace.log"
    console_path = ROOT / f"runtime-{case}-console.log"
    trace = trace_path.read_text(encoding="utf-8")
    console = console_path.read_text(encoding="utf-8")
    if len(trace) < 2_000 or "Soft reset" not in console:
        fail(f"{case} artifacts look truncated or fabricated")
    if f"RUN case={case} mame_commit={MAME_COMMIT}" not in console:
        fail(f"{case} console lacks pinned-commit provenance")
    if f"RUN rom_sha256={ROM_SHA256}" not in console:
        fail(f"{case} console lacks ROM provenance")
    if "unmapped sfr memory read from A9" not in console:
        fail(f"{case} console lacks the known Siemens A9 limitation")

    matches = PC_RE.findall(trace)
    cycles = [int(cycle) for cycle, _ in matches]
    pcs = [int(pc, 16) for _, pc in matches]
    if not matches or pcs[0] != 0 or "CYC=0 0000: debugger-start" not in trace:
        fail(f"{case} trace lacks objective reset evidence")
    if cycles != sorted(cycles):
        fail(f"{case} trace cycles are not monotonic")
    ordered_subsequence(pcs, RESET_PATH)
    target = pcs.index(0x5C00)
    if target != 7 or cycles[target] != 11:
        fail(f"{case} reset-to-5c00 count changed")
    if len(pcs) != summary["cases"][case]["pc_observations"]:
        fail(f"{case} PC observation count disagrees with summary")

    accesses = parse_accesses(console)
    distinct = int(summary["cases"][case]["xdata"]["distinct"])
    if len(accesses) != distinct:
        fail(f"{case} did not log every distinct XDATA operation/address")
    if summary["cases"][case]["xdata"]["overflow"] != "0":
        fail(f"{case} overflowed bounded XDATA instrumentation")
    return pcs, console


def verify_model(summary: dict[str, object], model: dict[str, object]) -> None:
    case = summary["cases"]["model"]
    execution = case["execution"]
    if execution["reason"] != "timer2-interrupt-storm":
        fail(f"unexpected model stop reason: {execution['reason']}")
    if execution["startup_frontier"].lower() != "5cd3":
        fail(f"model did not reach claimed startup frontier: {execution}")
    if int(execution["instructions"]) <= 31 or int(execution["cycles"]) <= 48:
        fail("model did not advance beyond the 31-observation baseline")
    if execution["init_entries"] != "1" or int(execution["timer2_entries"]) < 16:
        fail("restart/Timer-2 loop accounting is inconsistent")
    if execution["foreground_entries"] != "0":
        fail("trace unexpectedly claims a foreground loop")
    if case["xdata"]["unknown_reads"] != "0":
        fail("model should hit the SFR blocker before an unknown XDATA read")

    observed = parse_accesses(
        (ROOT / "runtime-model-console.log").read_text(encoding="utf-8")
    )
    ordered = [(op, address, pc, value) for op, address, pc, value, _, _ in observed]
    position = 0
    for expected in model["ordered_early_accesses"]:
        item = (
            expected["op"].lower(),
            expected["address"].lower(),
            expected["pc"].lower(),
            expected["value"].lower(),
        )
        try:
            position = ordered.index(item, position) + 1
        except ValueError:
            fail(f"runtime lacks ordered early XDATA access {item}")


def verify_sensitivity(summary: dict[str, object], console: str) -> None:
    dependency = summary["cases"]["no-xram"]["first_unknown_dependency"]
    if dependency != {"read_pc": "5c54", "decision_pc": "5c55", "value": "ff"}:
        fail(f"unexpected first disabled-XRAM dependency: {dependency}")
    if not re.search(
        r"XDATA first op=R addr=015b pc=5c81 value=ff .*unknown=1",
        console,
    ):
        fail("disabled-XRAM trace lacks failed read-after-write evidence")
    divergence = summary["xram_sensitivity"]["first_trace_divergence"]
    if divergence["model_pc"] != "5c84" or divergence["no_xram_pc"] != "5c92":
        fail(f"unexpected first XRAM-dependent path divergence: {divergence}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify Motronic XDATA runtime evidence")
    parser.add_argument(
        "--rom",
        type=Path,
        default=ROOT / "../../../analysis/TotalCombinedROM.bin",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    verify_rom(args.rom.resolve())
    verify_sources()
    model = json.loads((ROOT / "address-model.json").read_text(encoding="utf-8"))
    summary = json.loads((ROOT / "runtime-summary.json").read_text(encoding="utf-8"))
    if model["rom_sha256"] != ROM_SHA256:
        fail("address model is tied to the wrong ROM")
    if model["xram_window"]["classification"] != "retained RAM":
        fail("address model lost its explicit XRAM approximation")
    verify_artifact_hashes(summary)
    model_pcs, _ = verify_trace("model", summary)
    _, no_xram_console = verify_trace("no-xram", summary)
    for required_pc in (0x8F97, 0x9015, 0x5CD3, 0x002B, 0x2070):
        if required_pc not in model_pcs:
            fail(f"model trace lacks claimed deeper PC {required_pc:04x}")
    verify_model(summary, model)
    verify_sensitivity(summary, no_xram_console)
    print(
        "PASS: ROM, address model, ordered reset/XDATA path, deeper execution, "
        "and trace provenance verified"
    )


if __name__ == "__main__":
    main()
