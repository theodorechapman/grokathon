from __future__ import annotations

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "fixtures" / "profiles.json"
CHANNEL_PATH = ROOT / "evidence" / "channel-map.json"


class FixtureGateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixtures = json.loads(PROFILE_PATH.read_text())
        cls.channels = json.loads(CHANNEL_PATH.read_text())

    def test_required_profiles_are_complete(self) -> None:
        expected = {
            "key-on", "cold-crank", "warm-idle", "part-load",
            "wot", "overrun", "sensor-open", "sensor-short",
        }
        self.assertEqual(set(self.fixtures["profiles"]), expected)
        for name, profile in self.fixtures["profiles"].items():
            times = [frame["time_us"] for frame in profile["frames"]]
            self.assertEqual(times, sorted(set(times)), name)
            self.assertEqual(times[0], 0, name)
            for frame in profile["frames"]:
                self.assertEqual(len(frame["callback"]), 8, name)
                self.assertTrue(
                    all(
                        isinstance(value, int) and 0 <= value <= 127
                        for value in frame["callback"]
                    ),
                    name,
                )

    def test_normal_profiles_never_use_fault_rails(self) -> None:
        for name in self.fixtures["normal_profiles"]:
            for frame in self.fixtures["profiles"][name]["frames"]:
                self.assertTrue(
                    all(0 < value < 127 for value in frame["callback"]),
                    f"{name}@{frame['time_us']}",
                )

    def test_profiles_express_bounded_operating_relationships(self) -> None:
        profiles = self.fixtures["profiles"]
        final_air = {
            name: profiles[name]["frames"][-1]["callback"][0]
            for name in ("key-on", "warm-idle", "part-load", "wot")
        }
        self.assertLess(final_air["key-on"], final_air["warm-idle"])
        self.assertLess(final_air["warm-idle"], final_air["part-load"])
        self.assertLess(final_air["part-load"], final_air["wot"])
        self.assertLess(
            profiles["overrun"]["frames"][-1]["callback"][0],
            profiles["overrun"]["frames"][0]["callback"][0],
        )
        crank_supply = [
            frame["callback"][1]
            for frame in profiles["cold-crank"]["frames"]
        ]
        self.assertLess(min(crank_supply), crank_supply[0])
        for name in ("part-load", "wot", "overrun"):
            frames = profiles[name]["frames"]
            self.assertEqual({frame["callback"][2] for frame in frames}, {58})
            self.assertEqual({frame["callback"][3] for frame in frames}, {44})

    def test_fault_profiles_only_rail_the_assumed_target(self) -> None:
        target = self.fixtures["fault_assumption"]["default_target_channel"]
        open_final = self.fixtures["profiles"]["sensor-open"]["frames"][-1]
        short_final = self.fixtures["profiles"]["sensor-short"]["frames"][-1]
        self.assertEqual(open_final["callback"][target], 127)
        self.assertEqual(short_final["callback"][target], 0)
        for channel in set(range(8)) - {target}:
            self.assertNotIn(open_final["callback"][channel], (0, 127))
            self.assertNotIn(short_final["callback"][channel], (0, 127))

    def test_unobserved_channels_remain_neutral(self) -> None:
        for profile in self.fixtures["profiles"].values():
            for frame in profile["frames"]:
                self.assertEqual(frame["callback"][6:], [64, 64])

    def test_evidence_does_not_promote_inference_to_proof(self) -> None:
        channel_rows = self.channels["channels"]
        self.assertEqual(
            [row["channel"] for row in channel_rows if row["access"] == "proven"],
            list(range(6)),
        )
        self.assertTrue(
            all(
                row["physical_label_status"] != "proven"
                for row in channel_rows
            )
        )
        boundary = self.channels["firmware_boundary"]
        self.assertEqual(boundary["electrical_transfer_functions"], "unknown")
        self.assertEqual(boundary["open_short_polarity"], "unknown without the ECU analog front end")

    def test_no_unproven_engineering_units_enter_fixtures(self) -> None:
        lowered = PROFILE_PATH.read_text().lower()
        for forbidden in ("celsius", "fahrenheit", "\"volts\"", "\"rpm\"", "\"percent\""):
            self.assertNotIn(forbidden, lowered)

    def test_authored_files_stay_below_line_limit(self) -> None:
        for path in ROOT.rglob("*"):
            if path.is_file() and ".test-build" not in path.parts:
                count = len(path.read_bytes().splitlines())
                self.assertLess(count, 250, f"{path.relative_to(ROOT)} has {count} lines")


if __name__ == "__main__":
    unittest.main()
