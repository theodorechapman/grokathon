#!/usr/bin/env python3
"""Execute a bounded independent 8051 subset directly from raw ROM bytes."""
from __future__ import annotations
import argparse
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
CYCLES = {
    0x02: 2, 0x20: 2, 0x24: 1, 0x74: 1, 0x75: 2, 0x80: 2, 0x90: 2,
    0x92: 2, 0x93: 2, 0x94: 1, 0xA2: 1, 0xA3: 2, 0xC0: 2,
    0xC2: 1, 0xD0: 2, 0xD2: 1, 0xD3: 1, 0xE4: 1, 0xE5: 1,
    0xF0: 2,
}
VECTORS = {
    3: "external-0", 11: "timer-0", 19: "external-1", 27: "timer-1",
    35: "uart", 43: "timer-2", 67: "adc", 83: "external-3",
}


@dataclass
class State:
    pc: int = 0
    cycles: int = 0
    a: int = 0
    b: int = 0
    psw: int = 0
    sp: int = 7
    dptr: int = 0
    memory: dict[int, int] = field(default_factory=dict)

    def registers(self) -> dict[str, int]:
        return {"a": self.a, "b": self.b, "psw": self.psw,
                "sp": self.sp, "dptr": self.dptr}


def space(address: int) -> str:
    return "sfr" if address >= 0x80 else "idata"


def access(kind: str, address: int, data: int) -> dict[str, object]:
    return {"space": space(address), "access": kind, "address": address,
            "data": data & 0xFF, "source": "independent-static-semantics"}


def read_direct(state: State, address: int, accesses: list[dict]) -> int:
    special = {
        0x81: state.sp, 0x82: state.dptr & 0xFF,
        0x83: state.dptr >> 8, 0xD0: state.psw, 0xE0: state.a, 0xF0: state.b,
    }
    value = special.get(address, state.memory.get(address, 0))
    accesses.append(access("read", address, value))
    return value


def write_direct(
        state: State, address: int, value: int, accesses: list[dict]
) -> None:
    value &= 0xFF
    accesses.append(access("write", address, value))
    state.memory[address] = value
    if address == 0x81:
        state.sp = value
    elif address == 0x82:
        state.dptr = (state.dptr & 0xFF00) | value
    elif address == 0x83:
        state.dptr = (value << 8) | (state.dptr & 0xFF)
    elif address == 0xD0:
        state.psw = value
    elif address == 0xE0:
        set_acc(state, value)
    elif address == 0xF0:
        state.b = value


def set_acc(state: State, value: int) -> None:
    state.a = value & 0xFF
    parity = state.a.bit_count() & 1
    state.psw = (state.psw & 0xFE) | parity


def bit_location(bit_address: int) -> tuple[int, int]:
    if bit_address >= 0x80:
        return bit_address & 0xF8, 1 << (bit_address & 7)
    return 0x20 + (bit_address >> 3), 1 << (bit_address & 7)


def read_bit(state: State, address: int, accesses: list[dict]) -> int:
    direct, mask = bit_location(address)
    return 1 if read_direct(state, direct, accesses) & mask else 0


def write_bit(
        state: State, address: int, value: int, accesses: list[dict]
) -> None:
    direct, mask = bit_location(address)
    current = read_direct(state, direct, accesses)
    updated = current | mask if value else current & ~mask
    write_direct(state, direct, updated, accesses)


def set_flags(state: State, carry: bool, auxiliary: bool, overflow: bool) -> None:
    state.psw = (
        (state.psw & ~0xC4)
        | (0x80 if carry else 0)
        | (0x40 if auxiliary else 0)
        | (0x04 if overflow else 0)
    )


def execute(state: State, rom: bytes) -> list[dict[str, object]]:
    pc = state.pc
    opcode = rom[pc]
    if opcode not in CYCLES:
        raise ValueError(f"unsupported opcode {opcode:02x} at {pc:04x}")
    arg1 = rom[pc + 1] if pc + 1 < len(rom) else 0
    arg2 = rom[pc + 2] if pc + 2 < len(rom) else 0
    accesses: list[dict[str, object]] = []
    next_pc = pc + 1
    if opcode == 0x02:
        next_pc = (arg1 << 8) | arg2
    elif opcode == 0x20:
        relative = arg2 - 256 if arg2 & 0x80 else arg2
        next_pc = pc + 3 + (relative if read_bit(state, arg1, accesses) else 0)
    elif opcode == 0x24:
        old = state.a
        total = old + arg1
        result = total & 0xFF
        set_flags(
            state, total > 0xFF, (old & 0xF) + (arg1 & 0xF) > 0xF,
            bool((~(old ^ arg1) & (old ^ result)) & 0x80),
        )
        set_acc(state, result)
        next_pc = pc + 2
    elif opcode == 0x74:
        set_acc(state, arg1)
        next_pc = pc + 2
    elif opcode == 0x75:
        write_direct(state, arg1, arg2, accesses)
        next_pc = pc + 3
    elif opcode == 0x80:
        relative = arg1 - 256 if arg1 & 0x80 else arg1
        next_pc = pc + 2 + relative
    elif opcode == 0x90:
        state.dptr = (arg1 << 8) | arg2
        next_pc = pc + 3
    elif opcode == 0x92:
        write_bit(state, arg1, (state.psw >> 7) & 1, accesses)
        next_pc = pc + 2
    elif opcode == 0x93:
        set_acc(state, rom[(state.dptr + state.a) & 0xFFFF])
    elif opcode == 0x94:
        old, borrow = state.a, (state.psw >> 7) & 1
        subtrahend = arg1 + borrow
        result = (old - subtrahend) & 0xFF
        set_flags(
            state, old < subtrahend,
            (old & 0xF) < ((arg1 & 0xF) + borrow),
            bool(((old ^ subtrahend) & (old ^ result)) & 0x80),
        )
        set_acc(state, result)
        next_pc = pc + 2
    elif opcode == 0xA2:
        carry = read_bit(state, arg1, accesses)
        state.psw = (state.psw & 0x7F) | (carry << 7)
        next_pc = pc + 2
    elif opcode == 0xA3:
        state.dptr = (state.dptr + 1) & 0xFFFF
    elif opcode == 0xC0:
        value = read_direct(state, arg1, accesses)
        state.sp = (state.sp + 1) & 0xFF
        write_direct(state, state.sp, value, accesses)
        next_pc = pc + 2
    elif opcode in (0xC2, 0xD2):
        write_bit(state, arg1, int(opcode == 0xD2), accesses)
        next_pc = pc + 2
    elif opcode == 0xD0:
        value = read_direct(state, state.sp, accesses)
        state.sp = (state.sp - 1) & 0xFF
        write_direct(state, arg1, value, accesses)
        next_pc = pc + 2
    elif opcode == 0xD3:
        state.psw |= 0x80
    elif opcode == 0xE4:
        set_acc(state, 0)
    elif opcode == 0xE5:
        set_acc(state, read_direct(state, arg1, accesses))
        next_pc = pc + 2
    elif opcode == 0xF0:
        accesses.append({
            "space": "xdata", "access": "write", "address": state.dptr,
            "data": state.a, "source": "independent-static-semantics",
        })
    state.cycles += CYCLES[opcode]
    state.pc = next_pc & 0xFFFF
    return accesses


def build(args: argparse.Namespace) -> dict[str, object]:
    rom = args.rom.read_bytes()
    rom_sha = hashlib.sha256(rom).hexdigest()
    if rom_sha != args.expected_sha:
        raise AssertionError(f"ROM SHA-256 {rom_sha} != {args.expected_sha}")
    state = State()
    events = []
    for ordinal in range(args.count):
        pc = state.pc
        event = {
            "kind": "instruction", "ordinal": ordinal, "pc": pc,
            "cycles": state.cycles, "opcode": rom[pc],
            "registers": state.registers(), "accesses": [],
            "interrupt_entry": VECTORS.get(pc) if ordinal else None,
        }
        events.append(event)
        event["accesses"] = execute(state, rom)
    script_sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    return {
        "schema": "motronic-differential-event/v1",
        "provenance": {
            "engine": "independent-static", "runtime": False,
            "profile": args.profile, "tool_revision": script_sha,
            "rom_sha256": rom_sha, "rom_size": len(rom),
            "command": args.command,
        },
        "availability": {"cycles": "derived-8051-machine-cycles",
            "registers": ["a", "b", "psw", "sp", "dptr"],
            "access_spaces": {"idata": "derived", "sfr": "derived",
                              "xdata": "derived"},
            "interrupts": "derived-from-control-flow"},
        "events": events,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rom", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--command", required=True)
    args = parser.parse_args()
    args.output.write_text(
        json.dumps(build(args), sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
