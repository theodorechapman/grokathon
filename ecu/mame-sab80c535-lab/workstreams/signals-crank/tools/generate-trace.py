#!/usr/bin/env python3
"""Generate one deterministic MAME crank trace and its audit metadata."""

import argparse
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path


def _load(path: Path, name: str) -> object:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _arguments() -> argparse.Namespace:
    workstream = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "scenario",
        choices=(
            "stopped",
            "crank",
            "idle",
            "ramp",
            "steady",
            "dropout",
            "implausible-edge",
        ),
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--fixtures",
        type=Path,
        default=workstream / "fixtures" / "scenarios.json",
    )
    return parser.parse_args()


def _build_profile(types: object, data: dict[str, object], scenario: str) -> object:
    raw_geometry = dict(data["geometry"])
    raw_geometry.pop("vehicle_claim")
    raw_geometry["missing_positions"] = tuple(raw_geometry["missing_positions"])
    geometry = types.WheelGeometry(**raw_geometry)
    phases = tuple(
        types.CrankPhase(**phase)
        for phase in data["scenarios"][scenario]
    )
    return types.CrankProfile(
        name=scenario,
        machine_cycles_per_second=data["machine_cycles_per_second"],
        geometry=geometry,
        phases=phases,
    )


def main() -> None:
    args = _arguments()
    workstream = Path(__file__).resolve().parent.parent
    types = _load(workstream / "src" / "crank-types.py", "crank_types")
    generator = _load(workstream / "src" / "generate-crank.py", "generate_crank")
    renderer = _load(workstream / "src" / "render-trace.py", "render_trace")
    data = json.loads(args.fixtures.read_text(encoding="utf-8"))
    profile = _build_profile(types, data, args.scenario)
    transitions = generator.generate_crank(profile, types.PinTransition)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        renderer.render_trace(transitions, profile.name),
        encoding="utf-8",
    )
    captures = [item for item in transitions if item.captures]
    metadata = {
        "profile": profile.name,
        "qualification": data["qualification"],
        "vehicle_geometry_claim": False,
        "transition_count": len(transitions),
        "capture_count": len(captures),
        "capture_counts_by_phase": dict(Counter(item.phase for item in captures)),
        "first_cycle": transitions[0].cycle,
        "last_cycle": transitions[-1].cycle,
        "geometry": data["geometry"],
    }
    args.output.with_suffix(args.output.suffix + ".json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(args.output)


if __name__ == "__main__":
    main()
