#!/usr/bin/env python3
"""Negative configuration and integration-boundary gates."""

import importlib.util
import subprocess
import sys
import unittest
from dataclasses import replace
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


TYPES = _load(ROOT / "src" / "crank-types.py", "gate_crank_types")
GENERATOR = _load(ROOT / "src" / "generate-crank.py", "gate_generate_crank")


def _valid_profile() -> object:
    geometry = TYPES.WheelGeometry(12, (11,), "falling", 2, 8)
    phase = TYPES.CrankPhase("steady", revolutions=1, start_rpm=1000)
    return TYPES.CrankProfile("gate", 1_000_000, geometry, (phase,))


class NegativeGateTests(unittest.TestCase):
    def _reject(self, profile: object, message: str) -> None:
        with self.assertRaisesRegex(ValueError, message):
            GENERATOR.generate_crank(profile, TYPES.PinTransition)

    def test_rejects_impossible_geometry(self) -> None:
        profile = _valid_profile()
        self._reject(
            replace(profile, geometry=replace(profile.geometry, missing_positions=(2, 1))),
            "unique and sorted",
        )
        self._reject(
            replace(profile, geometry=replace(profile.geometry, missing_positions=tuple(range(12)))),
            "omit every",
        )
        self._reject(
            replace(profile, geometry=replace(profile.geometry, pulse_width_cycles=0)),
            "at least one cycle",
        )

    def test_rejects_invalid_phase_contracts(self) -> None:
        profile = _valid_profile()
        self._reject(replace(profile, phases=()), "at least one phase")
        bad_ramp = TYPES.CrankPhase("ramp", revolutions=1, start_rpm=200)
        self._reject(replace(profile, phases=(bad_ramp,)), "positive end RPM")
        bad_extra = TYPES.CrankPhase(
            "implausible",
            revolutions=1,
            start_rpm=1000,
            implausible_after_cycles=2,
        )
        self._reject(replace(profile, phases=(bad_extra,)), "sampleable")

    def test_rejects_unsampleable_speed(self) -> None:
        profile = _valid_profile()
        phase = replace(profile.phases[0], start_rpm=30_000_000)
        self._reject(replace(profile, phases=(phase,)), "collide|overlapping")

    def test_patches_do_not_bypass_firmware_state(self) -> None:
        patch_text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted((ROOT / "patches").glob("*.patch"))
        )
        for forbidden in ("m_internal_ram", "write_direct(", "space(AS_IDATA)"):
            self.assertNotIn(forbidden, patch_text)
        self.assertIn("SAB80C515_CC0_LINE", patch_text)
        self.assertIn("request_capture(0, true)", patch_text)
        self.assertNotIn("60-2", patch_text)

    def test_every_patch_is_well_formed(self) -> None:
        for path in sorted((ROOT / "patches").glob("*.patch")):
            result = subprocess.run(
                ["git", "apply", "--numstat", str(path)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=5,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_every_authored_file_stays_below_limit(self) -> None:
        text_suffixes = {".cpp", ".h", ".json", ".md", ".patch", ".py", ".sh"}
        for path in ROOT.rglob("*"):
            if not path.is_file() or path.suffix not in text_suffixes:
                continue
            line_count = len(path.read_text(encoding="utf-8").splitlines())
            self.assertLess(
                line_count,
                250,
                f"{path.relative_to(ROOT)} has {line_count} lines",
            )


if __name__ == "__main__":
    unittest.main()
