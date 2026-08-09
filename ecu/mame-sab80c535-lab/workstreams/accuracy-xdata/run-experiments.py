#!/usr/bin/env python3
"""Run bounded reset, unknown-input, and full-byte sensitivity experiments."""

import argparse
import importlib.util
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HARNESS_PATH = Path(__file__).with_name("runtime-harness.py")
HARNESS_SPEC = importlib.util.spec_from_file_location("runtime_harness", HARNESS_PATH)
if not HARNESS_SPEC or not HARNESS_SPEC.loader:
    raise RuntimeError(f"cannot load runtime harness: {HARNESS_PATH}")
runtime_harness = importlib.util.module_from_spec(HARNESS_SPEC)
HARNESS_SPEC.loader.exec_module(runtime_harness)
ROM_SHA256 = runtime_harness.ROM_SHA256
Runner = runtime_harness.Runner
artifact = runtime_harness.artifact
digest = runtime_harness.digest
signature = runtime_harness.signature


def run_named(
    runner: Runner,
    root: Path,
    name: str,
    settings: dict[str, str],
) -> dict:
    parsed, output = runner.run(settings)
    path = root / f"runtime-{name}.log"
    path.write_text(output, encoding="utf-8")
    parsed["settings"] = settings
    parsed["artifact"] = artifact(path)
    return parsed


def sweep_unknown(
    runner: Runner,
    address: str,
    base: dict[str, str],
) -> dict:
    groups: dict[tuple, list[str]] = defaultdict(list)
    samples: dict[tuple, dict] = {}

    def execute(value: int) -> tuple[int, dict]:
        settings = {
            **base,
            "MOTRONIC_INPUTS": f"{address}={value:02x}",
        }
        parsed, _ = runner.run(settings)
        return value, parsed

    print(f"sweeping {address}", flush=True)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = executor.map(execute, range(256))
    for value, parsed in results:
        key = signature(parsed)
        groups[key].append(f"{value:02x}")
        samples.setdefault(
            key,
            {
                "execution": parsed["execution"],
                "unknown_path": [
                    [item["address"], item["pc"]]
                    for item in parsed["unknown_reads"]
                ],
                "taint_outcomes": parsed["taint_outcomes"],
            },
        )
    outcomes = []
    for key, values in sorted(groups.items(), key=lambda item: item[1][0]):
        outcomes.append({"values": values, **samples[key]})
    return {
        "address": address,
        "values_tested": 256,
        "outcome_count": len(outcomes),
        "outcomes": outcomes,
    }


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mame",
        type=Path,
        default=Path("/tmp/mame-motronic-accuracy-xdata/motronic175"),
    )
    parser.add_argument(
        "--rom",
        type=Path,
        default=root / "../../../analysis/TotalCombinedROM.bin",
    )
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=Path("/tmp/mame-motronic-accuracy-xdata-run"),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent
    rom = args.rom.resolve()
    if digest(rom) != ROM_SHA256 or rom.stat().st_size != 0xA000:
        raise AssertionError("canonical ROM identity mismatch")
    if not args.mame.is_file():
        raise AssertionError(f"MAME target absent: {args.mame}")
    runner = Runner(args.mame.resolve(), rom, args.run_dir)
    cases = {
        "strict-unknown-reset": run_named(
            runner, root, "strict-unknown-reset",
            {"MOTRONIC_XRAM_RESET": "unknown"},
        ),
        "strict-zero-reset": run_named(
            runner, root, "strict-zero-reset",
            {"MOTRONIC_XRAM_RESET": "zero"},
        ),
        "approx-zero": run_named(
            runner,
            root,
            "approx-zero",
            {
                "MOTRONIC_XRAM_RESET": "zero",
                "MOTRONIC_UNKNOWN_POLICY": "value",
                "MOTRONIC_UNKNOWN_VALUE": "00",
            },
        ),
        "approx-zero-repeat": run_named(
            runner,
            root,
            "approx-zero-repeat",
            {
                "MOTRONIC_XRAM_RESET": "zero",
                "MOTRONIC_UNKNOWN_POLICY": "value",
                "MOTRONIC_UNKNOWN_VALUE": "00",
            },
        ),
        "approx-ff": run_named(
            runner,
            root,
            "approx-ff",
            {
                "MOTRONIC_XRAM_RESET": "ff",
                "MOTRONIC_UNKNOWN_POLICY": "value",
                "MOTRONIC_UNKNOWN_VALUE": "ff",
            },
        ),
    }
    startup_unknowns = sorted(
        {
            item["address"]
            for item in cases["approx-zero"]["unknown_reads"]
            if int(item["pc"], 16) in range(0x5C00, 0x5D10)
        }
    )
    print(f"startup unknowns: {startup_unknowns}", flush=True)
    base = {
        "MOTRONIC_XRAM_RESET": "zero",
        "MOTRONIC_UNKNOWN_POLICY": "value",
        "MOTRONIC_UNKNOWN_VALUE": "00",
        "MOTRONIC_STOP_AFTER_TAINT": "1",
    }
    sweeps = [sweep_unknown(runner, address, base) for address in startup_unknowns]
    output = {
        "schema": 1,
        "rom": {"bytes": rom.stat().st_size, "sha256": digest(rom)},
        "mame_commit": "a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e",
        "cases": cases,
        "startup_unknown_addresses": startup_unknowns,
        "sweeps": sweeps,
    }
    path = root / "runtime-results.json"
    path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}; swept {len(startup_unknowns)} startup addresses")


if __name__ == "__main__":
    main()
