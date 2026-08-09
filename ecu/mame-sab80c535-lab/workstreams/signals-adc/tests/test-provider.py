from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / ".test-build"
PROBE = BUILD / "provider-probe"


class NativeProviderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        compiler = shutil.which(os.environ.get("CXX", "c++"))
        if compiler is None:
            raise RuntimeError("C++ compiler is required for native provider tests")
        BUILD.mkdir(exist_ok=True)
        command = [
            compiler,
            "-std=c++17",
            "-Wall",
            "-Wextra",
            "-Werror",
            "-pedantic",
            "-I",
            str(ROOT / "src"),
            str(ROOT / "src" / "motronic175-adc.cpp"),
            str(ROOT / "tests" / "provider-probe.cpp"),
            "-o",
            str(PROBE),
        ]
        subprocess.run(command, check=True, timeout=30)
        cls.fixtures = json.loads(
            (ROOT / "fixtures" / "profiles.json").read_text()
        )

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(BUILD, ignore_errors=True)

    def probe(
        self,
        profile: str,
        time_us: int,
        fault_channel: int | None = None,
    ) -> list[int]:
        command = [str(PROBE), profile, str(time_us)]
        if fault_channel is not None:
            command.append(str(fault_channel))
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return [int(value) for value in result.stdout.strip().split(",")]

    def test_cpp_matches_every_machine_readable_frame(self) -> None:
        for profile_name, profile in self.fixtures["profiles"].items():
            for frame in profile["frames"]:
                with self.subTest(
                    profile=profile_name,
                    time_us=frame["time_us"],
                ):
                    self.assertEqual(
                        self.probe(profile_name, frame["time_us"]),
                        frame["callback"],
                    )

    def test_interpolation_and_loop_are_deterministic(self) -> None:
        self.assertEqual(self.probe("key-on", 25000)[1], 92)
        self.assertEqual(
            self.probe("warm-idle", 450000),
            self.probe("warm-idle", 50000),
        )
        self.assertEqual(
            self.probe("part-load", 900000),
            self.probe("part-load", 800000),
        )

    def test_fault_target_is_configurable_across_observed_channels(self) -> None:
        opened = self.probe("sensor-open", 200000, fault_channel=0)
        shorted = self.probe("sensor-short", 200000, fault_channel=5)
        self.assertEqual(opened[0], 127)
        self.assertEqual(opened[3], 44)
        self.assertEqual(shorted[5], 0)
        self.assertEqual(shorted[3], 44)

    def test_invalid_configuration_is_rejected(self) -> None:
        for command in (
            [str(PROBE), "not-a-profile", "0"],
            [str(PROBE), "sensor-open", "0", "6"],
            [str(PROBE), "key-on", "not-time"],
        ):
            with self.subTest(command=command):
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                self.assertEqual(result.returncode, 2)
                self.assertTrue(result.stderr)


if __name__ == "__main__":
    unittest.main()
