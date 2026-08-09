"""Shared immutable contracts for crank stimulus generation."""

from dataclasses import dataclass
from typing import Literal

Edge = Literal["falling", "rising"]
PhaseKind = Literal[
    "stopped",
    "crank",
    "idle",
    "ramp",
    "steady",
    "dropout",
    "implausible",
]


@dataclass(frozen=True)
class WheelGeometry:
    positions_per_revolution: int
    missing_positions: tuple[int, ...]
    capture_edge: Edge
    pulse_width_cycles: int
    initial_settle_cycles: int


@dataclass(frozen=True)
class CrankPhase:
    kind: PhaseKind
    revolutions: int = 0
    duration_cycles: int = 0
    start_rpm: int = 0
    end_rpm: int = 0
    implausible_after_cycles: int = 0


@dataclass(frozen=True)
class CrankProfile:
    name: str
    machine_cycles_per_second: int
    geometry: WheelGeometry
    phases: tuple[CrankPhase, ...]


@dataclass(frozen=True)
class PinTransition:
    cycle: int
    level: int
    captures: bool
    phase: str
    revolution: int
    position: int
