"""Pure deterministic timestamp generator for a configurable crank wheel."""

from fractions import Fraction
from typing import Iterable


def _round_cycle(value: Fraction) -> int:
    return (value.numerator * 2 + value.denominator) // (2 * value.denominator)


def _validate(profile: object) -> None:
    geometry = profile.geometry
    if not profile.name:
        raise ValueError("profile name must not be empty")
    if profile.machine_cycles_per_second <= 0:
        raise ValueError("machine cycle rate must be positive")
    if geometry.positions_per_revolution < 2:
        raise ValueError("wheel needs at least two positions")
    if geometry.capture_edge not in ("falling", "rising"):
        raise ValueError("capture edge must be falling or rising")
    if geometry.pulse_width_cycles < 1:
        raise ValueError("pulse level must be held for at least one cycle")
    if geometry.initial_settle_cycles < 1:
        raise ValueError("initial pin level must settle for at least one cycle")
    missing = geometry.missing_positions
    if tuple(sorted(set(missing))) != missing:
        raise ValueError("missing positions must be unique and sorted")
    if any(position < 0 or position >= geometry.positions_per_revolution for position in missing):
        raise ValueError("missing position lies outside the wheel")
    if len(missing) == geometry.positions_per_revolution:
        raise ValueError("wheel cannot omit every position")
    if not profile.phases:
        raise ValueError("profile must contain at least one phase")

    moving = {"crank", "idle", "ramp", "steady", "dropout", "implausible"}
    for phase in profile.phases:
        if phase.kind == "stopped":
            if phase.duration_cycles <= 0 or phase.revolutions:
                raise ValueError("stopped phase needs duration only")
            continue
        if phase.kind not in moving:
            raise ValueError(f"unsupported phase kind: {phase.kind}")
        if phase.revolutions <= 0 or phase.start_rpm <= 0:
            raise ValueError(f"{phase.kind} phase needs revolutions and positive RPM")
        if phase.kind == "ramp" and phase.end_rpm <= 0:
            raise ValueError("ramp phase needs a positive end RPM")
        if phase.end_rpm < 0:
            raise ValueError("end RPM cannot be negative")
        if phase.kind == "implausible":
            minimum = geometry.pulse_width_cycles + 1
            if phase.implausible_after_cycles < minimum:
                raise ValueError("implausible edge must remain electrically sampleable")
        elif phase.implausible_after_cycles:
            raise ValueError("only implausible phases may insert an extra edge")


def _phase_rpm(phase: object, slot: int, total_slots: int) -> Fraction:
    end = phase.end_rpm or phase.start_rpm
    if total_slots == 1:
        return Fraction(end)
    return Fraction(phase.start_rpm) + Fraction(
        (end - phase.start_rpm) * slot,
        total_slots - 1,
    )


def _iter_pulses(profile: object) -> Iterable[tuple[int, str, int, int]]:
    geometry = profile.geometry
    current = Fraction(geometry.initial_settle_cycles)
    revolution_base = 0
    cycles_per_minute = profile.machine_cycles_per_second * 60

    for phase in profile.phases:
        if phase.kind == "stopped":
            current += phase.duration_cycles
            continue
        total_slots = phase.revolutions * geometry.positions_per_revolution
        extra_inserted = False
        for slot in range(total_slots):
            position = slot % geometry.positions_per_revolution
            revolution = revolution_base + slot // geometry.positions_per_revolution
            rpm = _phase_rpm(phase, slot, total_slots)
            pulse_cycle = _round_cycle(current)
            present = position not in geometry.missing_positions
            if present and phase.kind != "dropout":
                yield pulse_cycle, phase.kind, revolution, position
                if phase.kind == "implausible" and not extra_inserted:
                    yield (
                        pulse_cycle + phase.implausible_after_cycles,
                        phase.kind,
                        revolution,
                        position,
                    )
                    extra_inserted = True
            current += Fraction(cycles_per_minute, geometry.positions_per_revolution) / rpm
        revolution_base += phase.revolutions


def generate_crank(profile: object, transition_type: type) -> tuple[object, ...]:
    """Generate level transitions; ASSERT/high is level 1 and CLEAR/low is 0."""
    _validate(profile)
    geometry = profile.geometry
    idle_level = 1 if geometry.capture_edge == "falling" else 0
    capture_level = 1 - idle_level
    raw: list[tuple[int, int, bool, str, int, int]] = [
        (0, idle_level, False, "initial", -1, -1)
    ]
    for cycle, phase, revolution, position in _iter_pulses(profile):
        raw.append((cycle, capture_level, True, phase, revolution, position))
        raw.append(
            (
                cycle + geometry.pulse_width_cycles,
                idle_level,
                False,
                phase,
                revolution,
                position,
            )
        )
    raw.sort(key=lambda item: item[0])

    previous_cycle = -1
    previous_level = 1 - idle_level
    result: list[object] = []
    for cycle, level, captures, phase, revolution, position in raw:
        if cycle <= previous_cycle:
            raise ValueError("transitions collide at configured speed")
        if level == previous_level:
            raise ValueError("overlapping pulses do not produce an edge")
        result.append(
            transition_type(cycle, level, captures, phase, revolution, position)
        )
        previous_cycle = cycle
        previous_level = level
    return tuple(result)
