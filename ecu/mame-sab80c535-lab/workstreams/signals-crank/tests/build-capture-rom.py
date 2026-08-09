#!/usr/bin/env python3
"""Build a deterministic 8051 oracle for external CC0 capture timing."""

import argparse
import hashlib
import zlib
from pathlib import Path

ROM_SIZE = 0x800
EXPECTED_CAPTURE_DELTA = 121


class _Rom:
    def __init__(self) -> None:
        self.data = bytearray([0xFF] * ROM_SIZE)
        self.pc = 0
        self.labels: dict[str, int] = {}
        self.absolute: list[tuple[int, str]] = []
        self.relative: list[tuple[int, str]] = []

    def seek(self, address: int) -> None:
        self.pc = address

    def label(self, name: str) -> None:
        self.labels[name] = self.pc

    def emit(self, *values: int) -> None:
        self.data[self.pc : self.pc + len(values)] = bytes(values)
        self.pc += len(values)

    def ljmp(self, label: str) -> None:
        self.emit(0x02, 0, 0)
        self.absolute.append((self.pc - 2, label))

    def relative_jump(self, opcode: int, label: str, *operands: int) -> None:
        self.emit(opcode, *operands, 0)
        self.relative.append((self.pc - 1, label))

    def finish(self) -> bytes:
        for offset, label in self.absolute:
            target = self.labels[label]
            self.data[offset] = target >> 8
            self.data[offset + 1] = target & 0xFF
        for offset, label in self.relative:
            displacement = self.labels[label] - (offset + 1)
            if not -128 <= displacement <= 127:
                raise ValueError(f"relative jump to {label} is out of range")
            self.data[offset] = displacement & 0xFF
        return bytes(self.data)


def _mov(rom: _Rom, address: int, value: int) -> None:
    rom.emit(0x75, address, value)


def _fail(rom: _Rom, code: int) -> None:
    rom.label(f"fail_{code}")
    rom.emit(0x74, code)
    rom.ljmp("report")


def _add_main(rom: _Rom) -> None:
    rom.label("main")
    _mov(rom, 0x81, 0x5F)
    _mov(rom, 0xA8, 0)
    _mov(rom, 0xB8, 0)
    _mov(rom, 0xC0, 0)
    for address in range(0x30, 0x36):
        _mov(rom, address, 0)
    _mov(rom, 0x90, 0xFF)
    _mov(rom, 0xC1, 0x01)
    _mov(rom, 0xCC, 0)
    _mov(rom, 0xCD, 0)
    _mov(rom, 0xC8, 0x01)
    _mov(rom, 0xB8, 0x04)
    _mov(rom, 0xA8, 0x80)

    rom.label("wait")
    rom.emit(0xE5, 0x35)
    rom.relative_jump(0x70, "report")
    rom.emit(0xE5, 0x30)
    rom.relative_jump(0xB4, "wait", 2)
    rom.emit(0x7F, 0xFF)
    rom.label("settle")
    rom.relative_jump(0xDF, "settle")
    rom.emit(0xE5, 0x30)
    rom.relative_jump(0xB4, "fail_4", 2)
    rom.emit(0xE5, 0xC0, 0x54, 0x04)
    rom.relative_jump(0x70, "fail_5")
    _mov(rom, 0xA8, 0)
    rom.emit(0xE4)
    rom.ljmp("report")


def _add_isr(rom: _Rom) -> None:
    rom.label("ext3_isr")
    rom.emit(0xC0, 0xE0, 0xC0, 0xD0)
    rom.relative_jump(0x20, "irq_flag_failure", 0xC2)
    rom.emit(0x05, 0x30, 0xE5, 0x30)
    rom.relative_jump(0xB4, "second_capture", 1)
    rom.emit(0x85, 0xCA, 0x31, 0x85, 0xCB, 0x32)
    rom.relative_jump(0x80, "isr_done")

    rom.label("second_capture")
    rom.relative_jump(0xB4, "count_failure", 2)
    rom.emit(0xE5, 0xCA, 0xC3, 0x95, 0x31)
    rom.relative_jump(0xB4, "delta_failure", EXPECTED_CAPTURE_DELTA)
    rom.emit(0xE5, 0xCB, 0x95, 0x32)
    rom.relative_jump(0x70, "delta_failure")
    rom.relative_jump(0x80, "isr_done")

    rom.label("irq_flag_failure")
    _mov(rom, 0x35, 1)
    rom.relative_jump(0x80, "isr_done")
    rom.label("count_failure")
    _mov(rom, 0x35, 2)
    rom.relative_jump(0x80, "isr_done")
    rom.label("delta_failure")
    _mov(rom, 0x35, 3)
    rom.label("isr_done")
    rom.emit(0xD0, 0xD0, 0xD0, 0xE0, 0x32)


def build_capture_rom() -> bytes:
    rom = _Rom()
    rom.seek(0)
    rom.ljmp("main")
    rom.seek(0x53)
    rom.ljmp("ext3_isr")
    rom.seek(0x100)
    _add_main(rom)
    _add_isr(rom)
    for code in (4, 5):
        _fail(rom, code)
    rom.label("report")
    rom.emit(0x90, 0xFF, 0x00, 0xF0, 0x80, 0xFE)
    return rom.finish()


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "artifacts" / "sab80c515-capture-test.bin",
    )
    args = parser.parse_args()
    payload = build_capture_rom()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)
    print(f"path={args.output}")
    print(f"crc32={zlib.crc32(payload):08x}")
    print(f"sha1={hashlib.sha1(payload).hexdigest()}")
    print(f"sha256={hashlib.sha256(payload).hexdigest()}")


if __name__ == "__main__":
    main()
