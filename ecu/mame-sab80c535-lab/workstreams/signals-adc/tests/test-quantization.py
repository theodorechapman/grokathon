from __future__ import annotations

import math
import unittest

from signals_adc import AdcQuantizer


class QuantizationTest(unittest.TestCase):
    def test_ratio_boundaries_and_rounding(self) -> None:
        self.assertEqual(AdcQuantizer.from_ratio(0.0), 0)
        self.assertEqual(AdcQuantizer.from_ratio(1.0), 127)
        self.assertEqual(AdcQuantizer.from_ratio(0.5), 64)
        self.assertEqual(AdcQuantizer.from_ratio(63.49 / 127), 63)
        self.assertEqual(AdcQuantizer.from_ratio(63.5 / 127), 64)

    def test_caller_supplies_voltage_reference(self) -> None:
        self.assertEqual(AdcQuantizer.from_voltage(1.0, 2.0), 64)
        self.assertEqual(AdcQuantizer.from_voltage(0.0, 3.3), 0)
        self.assertEqual(AdcQuantizer.from_voltage(3.3, 3.3), 127)

    def test_core_addat_convention_round_trips(self) -> None:
        for callback_count in range(128):
            addat = AdcQuantizer.to_addat(callback_count)
            self.assertEqual(addat, callback_count * 2)
            self.assertEqual(AdcQuantizer.from_addat(addat), callback_count)

    def test_invalid_values_fail_loudly(self) -> None:
        invalid_ratios = (-0.01, 1.01, math.nan, math.inf)
        for ratio in invalid_ratios:
            with self.subTest(ratio=ratio), self.assertRaises(ValueError):
                AdcQuantizer.from_ratio(ratio)
        for addat in (-1, 1, 255):
            with self.subTest(addat=addat), self.assertRaises(ValueError):
                AdcQuantizer.from_addat(addat)
        with self.assertRaises(ValueError):
            AdcQuantizer.from_voltage(1.0, 0.0)
        with self.assertRaises(TypeError):
            AdcQuantizer.to_addat(True)


if __name__ == "__main__":
    unittest.main()
