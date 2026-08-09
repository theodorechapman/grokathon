"""Unit conversion for the SAB80C515 MAME ADC callback boundary."""

from __future__ import annotations

import math


class AdcQuantizer:
    """Convert explicit reference ratios to the core's 7-bit callback unit."""

    CALLBACK_MAX = 127
    ADDAT_MAX = 254

    @classmethod
    def from_ratio(cls, ratio: float) -> int:
        cls._require_finite(ratio, "ratio")
        if not 0.0 <= ratio <= 1.0:
            raise ValueError("ratio must be between 0 and 1")
        return math.floor(ratio * cls.CALLBACK_MAX + 0.5)

    @classmethod
    def to_ratio(cls, callback_count: int) -> float:
        cls._require_callback(callback_count)
        return callback_count / cls.CALLBACK_MAX

    @classmethod
    def from_voltage(cls, input_voltage: float, reference_voltage: float) -> int:
        """Quantize caller-supplied voltages without assuming the ECU reference."""
        cls._require_finite(input_voltage, "input_voltage")
        cls._require_finite(reference_voltage, "reference_voltage")
        if reference_voltage <= 0:
            raise ValueError("reference_voltage must be positive")
        return cls.from_ratio(input_voltage / reference_voltage)

    @classmethod
    def to_addat(cls, callback_count: int) -> int:
        cls._require_callback(callback_count)
        return callback_count * 2

    @classmethod
    def from_addat(cls, addat: int) -> int:
        if isinstance(addat, bool) or not isinstance(addat, int):
            raise TypeError("addat must be an integer")
        if not 0 <= addat <= cls.ADDAT_MAX:
            raise ValueError("addat must be between 0 and 254")
        if addat % 2:
            raise ValueError("odd ADDAT values are unreachable by this MAME core")
        return addat // 2

    @staticmethod
    def _require_finite(value: float, name: str) -> None:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError(f"{name} must be numeric")
        if not math.isfinite(value):
            raise ValueError(f"{name} must be finite")

    @classmethod
    def _require_callback(cls, callback_count: int) -> None:
        if isinstance(callback_count, bool) or not isinstance(callback_count, int):
            raise TypeError("callback_count must be an integer")
        if not 0 <= callback_count <= cls.CALLBACK_MAX:
            raise ValueError("callback_count must be between 0 and 127")
