#!/usr/bin/env python3
"""Pure tests for deterministic profile and wheel behavior."""

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load(path: Path, name: str) -> object:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


TYPES = _load(ROOT / "src" / "crank-types.py", "test_crank_types")
GENERATOR = _load(ROOT / "src" / "generate-crank.py", "test_generate_crank")
RENDERER = _load(ROOT / "src" / "render-trace.py", "test_render_trace")
FIXTURES = json.loads((ROOT / "fixtures" / "scenarios.json").read_text())


def _profile(name: str) -> object:
    source = dict(FIXTURES["geometry"])
    source.pop("vehicle_claim")
    source["missing_positions"] = tuple(source["missing_positions"])
    geometry = TYPES.WheelGeometry(**source)
    phases = tuple(TYPES.CrankPhase(**item) for item in FIXTURES["scenarios"][name])
    return TYPES.CrankProfile(
        name,
        FIXTURES["machine_cycles_per_second"],
        geometry,
        phases,
    )


def _generate(name: str) -> tuple[object, ...]:
    return GENERATOR.generate_crank(_profile(name), TYPES.PinTransition)


class GeneratorTests(unittest.TestCase):
    def test_stopped_has_no_capture_edges(self) -> None:
        transitions = _generate("stopped")
        self.assertEqual([(item.cycle, item.level) for item in transitions], [(0, 1)])

    def test_crank_respects_missing_position(self) -> None:
        captures = [item for item in _generate("crank") if item.captures]
        self.assertEqual(len(captures), 3 * 11)
        self.assertNotIn(11, {item.position for item in captures})
        regular = captures[1].cycle - captures[0].cycle
        gap = captures[11].cycle - captures[10].cycle
        self.assertGreater(gap, regular * 1.9)

    def test_ramp_intervals_contract(self) -> None:
        captures = [item for item in _generate("ramp") if item.captures]
        early = captures[1].cycle - captures[0].cycle
        late = captures[-1].cycle - captures[-2].cycle
        self.assertGreater(early, late)

    def test_dropout_advances_time_without_edges(self) -> None:
        captures = [item for item in _generate("dropout") if item.captures]
        self.assertEqual(len(captures), 22)
        gap = captures[11].cycle - captures[10].cycle
        regular = captures[1].cycle - captures[0].cycle
        self.assertGreater(gap, regular * 12)

    def test_implausible_edge_is_transport_valid(self) -> None:
        captures = [item for item in _generate("implausible-edge") if item.captures]
        differences = [
            right.cycle - left.cycle
            for left, right in zip(captures, captures[1:])
        ]
        self.assertEqual(min(differences), 4)

    def test_output_is_byte_for_byte_deterministic(self) -> None:
        first = _generate("steady")
        second = _generate("steady")
        self.assertEqual(first, second)
        text = RENDERER.render_trace(first, "steady")
        self.assertTrue(text.startswith("# Motronic crank pin transitions\n"))
        self.assertEqual(text, RENDERER.render_trace(second, "steady"))


if __name__ == "__main__":
    unittest.main()
