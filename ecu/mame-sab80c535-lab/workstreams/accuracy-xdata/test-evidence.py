#!/usr/bin/env python3
"""Positive and negative verification gates for the XDATA evidence bundle."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
EVENT = re.compile(
    r"XEV seq=(\d+) op=([RW]) addr=([0-9a-f]{4}) pc=([0-9a-f]{4}) "
    r"value=([0-9a-f]{2}) class=([a-z-]+) taint=([01])",
    re.IGNORECASE,
)


def fail(message: str) -> None:
    raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(name: str) -> dict:
    path = ROOT / name
    if not path.is_file():
        fail(f"required artifact is absent: {name}")
    return json.loads(path.read_text(encoding="utf-8"))


def verify_rom(path: Path) -> None:
    if not path.is_file() or path.stat().st_size != 0xA000:
        fail("canonical ROM size mismatch")
    if digest(path) != ROM_SHA256:
        fail("canonical ROM SHA-256 mismatch")


def verify_line_limits() -> None:
    patterns = ("*.py", "*.sh", "src/*.cpp", "src/*.h")
    for pattern in patterns:
        for path in ROOT.glob(pattern):
            lines = path.read_text(encoding="utf-8").splitlines()
            if len(lines) >= 250:
                fail(f"authored file exceeds 249 lines: {path.name} ({len(lines)})")


def operation_classes(entry: dict, op: str) -> set[str]:
    return {
        item["classification"]
        for item in entry["operations"]
        if item["op"] == op
    }


def verify_inventory(inventory: dict) -> None:
    addresses = inventory["addresses"]
    if len(addresses) != 0x500:
        fail(f"inventory has {len(addresses)} addresses, expected 1280")
    by_address = {item["address"]: item for item in addresses}
    if len(by_address) != len(addresses):
        fail("inventory contains duplicate addresses")
    for address in ("0000", "015a", "015b", "020b", "020c"):
        classes = operation_classes(by_address[address], "R") | operation_classes(
            by_address[address], "W"
        )
        if classes and classes != {"retained-marker-storage"}:
            fail(f"{address} lost retained-marker classification: {classes}")
    if len(by_address["0300"]["operations"]) < 2:
        fail("fault-record storage lacks clear and consumer evidence")
    for address in ("a040", "a041"):
        if operation_classes(by_address[address], "W") != {"output-latch"}:
            fail(f"{address} write is not classified as output latch")
        if operation_classes(by_address[address], "R") != {"input-status"}:
            fail(f"{address} read improperly aliases output semantics")
    if operation_classes(by_address["a081"], "R") != {"input-status"}:
        fail("a081 read classification is absent")
    if any(
        "paging" in item["classification"]
        for address in addresses[0x400:]
        for item in address["operations"]
    ):
        fail("inventory invents an ASIC paging-control classification")
    if by_address["a000"]["accessed"]:
        fail("negative classification gate: unreferenced a000 became hardware")


def parse_events(name: str) -> list[tuple]:
    text = (ROOT / f"runtime-{name}.log").read_text(encoding="utf-8")
    events = [
        (int(seq), op, address.lower(), pc.lower(), value.lower(), classification, taint)
        for seq, op, address, pc, value, classification, taint in EVENT.findall(text)
    ]
    if not events:
        fail(f"{name} has no access events")
    if [item[0] for item in events] != list(range(1, len(events) + 1)):
        fail(f"{name} access sequence is not exact and monotonic")
    return events


def find_event(events: list[tuple], op: str, address: str, pc: str) -> int:
    for index, item in enumerate(events):
        if item[1:4] == (op, address, pc):
            return index
    fail(f"missing access {op} {address} at {pc}")
    return -1


def verify_access_ordering() -> None:
    events = parse_events("strict-zero-reset")
    expected = [
        ("W", "a081", "5c0c"),
        ("W", "a040", "5c1c"),
        ("W", "0162", "5c4e"),
        ("R", "0000", "5c54"),
        ("W", "015b", "5c78"),
        ("R", "015b", "5c81"),
        ("R", "a040", "5cea"),
    ]
    positions = [find_event(events, *item) for item in expected]
    if positions != sorted(positions):
        fail(f"startup accesses are out of order: {positions}")
    write = events[positions[1]]
    read = events[positions[-1]]
    if write[4] != "ff" or read[4] != "00" or read[6] != "1":
        fail("a040 read incorrectly reflects the written output latch")
    marker_write = events[positions[4]]
    marker_read = events[positions[5]]
    if marker_write[4] != marker_read[4]:
        fail("015b runtime read-after-write evidence changed")


def stable_view(case: dict) -> tuple:
    execution = case["execution"]
    xdata = case["xdata"]
    return (
        execution["reason"],
        execution["instructions"],
        execution["startup_frontier"],
        execution["pc_hash"],
        xdata["events"],
        xdata["unknown_reads"],
    )


def verify_runtime(results: dict) -> None:
    if results["rom"] != {"bytes": 40960, "sha256": ROM_SHA256}:
        fail("runtime results are tied to another ROM")
    cases = results["cases"]
    unknown = cases["strict-unknown-reset"]
    zero = cases["strict-zero-reset"]
    if unknown["xdata"]["first_unknown_addr"] != "0000":
        fail("strict unknown reset did not expose the first uninitialized read")
    if zero["xdata"]["first_unknown_addr"] != "a040":
        fail("zero reset did not reach the first unknown external input")
    if zero["xdata"]["first_unknown_pc"] != "5cea":
        fail("first unknown external dependency moved from 5cea")
    if stable_view(cases["approx-zero"]) != stable_view(cases["approx-zero-repeat"]):
        fail("identical deterministic runs diverged")
    if cases["approx-zero"]["execution"]["pc_hash"] == cases["approx-ff"]["execution"]["pc_hash"]:
        fail("zero/ff approximation sensitivity is absent")
    if results["startup_unknown_addresses"] != ["a040"]:
        fail(f"unexpected startup unknown set: {results['startup_unknown_addresses']}")
    if len(results["sweeps"]) != 1 or results["sweeps"][0]["values_tested"] != 256:
        fail("full startup byte sweep is absent")
    outcomes = results["sweeps"][0]["outcomes"]
    branch_groups = {
        tuple(item["values"]): {
            outcome["next_pc"]
            for outcome in item["taint_outcomes"]
            if outcome["read_pc"] == "5cea"
        }
        for item in outcomes
    }
    all_values = {value for values in branch_groups for value in values}
    next_pcs = set().union(*branch_groups.values())
    if len(all_values) != 256 or next_pcs != {"5cf1", "5d0a"}:
        fail("a040 sweep does not prove both startup branch outcomes")


def verify_artifacts(results: dict) -> None:
    for case in results["cases"].values():
        item = case["artifact"]
        path = ROOT / item["path"]
        if path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
            fail(f"runtime artifact hash mismatch: {path.name}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--rom",
        type=Path,
        default=ROOT / "../../../analysis/TotalCombinedROM.bin",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    verify_rom(args.rom.resolve())
    verify_line_limits()
    verify_inventory(load_json("address-inventory.json"))
    results = load_json("runtime-results.json")
    verify_runtime(results)
    verify_artifacts(results)
    verify_access_ordering()
    print("PASS: ROM, classifications, reset, taint, ordering, determinism, sensitivity")


if __name__ == "__main__":
    main()
