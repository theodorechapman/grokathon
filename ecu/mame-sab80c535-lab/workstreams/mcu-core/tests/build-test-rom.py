#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

from pathlib import Path

ROM_SIZE = 0x800


class Rom:
    def __init__(self) -> None:
        self.data = bytearray([0xFF] * ROM_SIZE)
        self.pc = 0
        self.labels: dict[str, int] = {}
        self.absolute: list[tuple[int, str]] = []

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

    def cjne(self, value: int, label: str) -> None:
        self.emit(0xB4, value, 2, 0x80, 3)
        self.ljmp(label)

    def finish(self) -> bytes:
        for offset, label in self.absolute:
            target = self.labels[label]
            self.data[offset] = target >> 8
            self.data[offset + 1] = target & 0xFF
        return bytes(self.data)


def mov_direct(rom: Rom, address: int, value: int) -> None:
    rom.emit(0x75, address, value)


def expect(rom: Rom, address: int, value: int, code: int) -> None:
    rom.emit(0xE5, address)
    rom.cjne(value, f"fail_{code:02x}")


def expect_mask(rom: Rom, address: int, mask: int, value: int, code: int) -> None:
    rom.emit(0xE5, address, 0x54, mask)
    rom.cjne(value, f"fail_{code:02x}")


def add_vectors(rom: Rom) -> None:
    for address, label in (
        (0x0000, "main"),
        (0x002B, "timer2_isr"),
        (0x0043, "adc_isr"),
        (0x005B, "compare_isr"),
    ):
        rom.seek(address)
        rom.ljmp(label)


def add_reset_and_conflict_tests(rom: Rom, failures: list[int]) -> None:
    reset_registers = (
        (0xA9, 0), (0xB8, 0), (0xB9, 0), (0xC0, 0), (0xC1, 0),
        (0xC2, 0), (0xC3, 0), (0xC4, 0), (0xC5, 0), (0xC6, 0),
        (0xC7, 0), (0xC8, 0), (0xCA, 0), (0xCB, 0), (0xCC, 0),
        (0xCD, 0), (0xD8, 0), (0xD9, 0), (0xDA, 0),
    )
    for code, (address, value) in enumerate(reset_registers, 1):
        expect(rom, address, value, code)
        failures.append(code)

    mov_direct(rom, 0xA9, 0xFF)
    expect(rom, 0xA9, 0x3F, 0x20)
    mov_direct(rom, 0xB9, 0xFF)
    expect(rom, 0xB9, 0x3F, 0x21)
    mov_direct(rom, 0xB8, 0x2A)
    expect(rom, 0xB8, 0x2A, 0x22)
    expect(rom, 0xA9, 0x3F, 0x23)
    rom.emit(0xD2, 0xA9)
    expect_mask(rom, 0xA8, 0x02, 0x02, 0x24)
    expect(rom, 0xA9, 0x3F, 0x25)
    rom.emit(0xD2, 0xBE)
    expect(rom, 0xA9, 0x7F, 0x26)
    rom.emit(0x00, 0x00, 0x00, 0x00)
    expect(rom, 0xB8, 0x2A, 0x27)
    failures.extend(range(0x20, 0x28))


def add_storage_and_bit_tests(rom: Rom, failures: list[int]) -> None:
    mov_direct(rom, 0xC0, 0)
    rom.emit(0xD2, 0xC6)
    expect(rom, 0xC0, 0x40, 0x30)
    rom.emit(0xC2, 0xC6)
    expect(rom, 0xC0, 0, 0x31)
    for index, address in enumerate(range(0xC2, 0xC8)):
        value = 0x41 + index
        mov_direct(rom, address, value)
        expect(rom, address, value, 0x32 + index)
    for index, address in enumerate(range(0xCA, 0xCE)):
        value = 0x51 + index
        mov_direct(rom, address, value)
        expect(rom, address, value, 0x38 + index)
    mov_direct(rom, 0xD9, 0xAB)
    expect(rom, 0xD9, 0xAB, 0x3C)
    failures.extend(range(0x30, 0x3D))


def add_timer_tests(rom: Rom, failures: list[int]) -> None:
    mov_direct(rom, 0xC8, 0)
    mov_direct(rom, 0xC0, 0)
    mov_direct(rom, 0xC1, 0x08)
    mov_direct(rom, 0xC2, 0x04)
    mov_direct(rom, 0xC3, 0)
    mov_direct(rom, 0xCC, 0)
    mov_direct(rom, 0xCD, 0)
    mov_direct(rom, 0xC8, 1)
    rom.emit(0x00, 0x00)
    expect_mask(rom, 0xC0, 0x08, 0x08, 0x40)
    mov_direct(rom, 0xC8, 0)
    mov_direct(rom, 0x32, 0)
    mov_direct(rom, 0xB8, 0x08)
    mov_direct(rom, 0xA8, 0x80)
    expect(rom, 0x32, 0xC3, 0x41)
    expect_mask(rom, 0xC0, 0x08, 0, 0x42)
    mov_direct(rom, 0xA8, 0)
    mov_direct(rom, 0xB8, 0)

    mov_direct(rom, 0xC0, 0)
    mov_direct(rom, 0xC1, 0)
    mov_direct(rom, 0xCC, 0xFC)
    mov_direct(rom, 0xCD, 0xFF)
    mov_direct(rom, 0xC8, 1)
    rom.emit(0x00, 0x00)
    mov_direct(rom, 0xC8, 0)
    expect_mask(rom, 0xC0, 0x40, 0x40, 0x43)
    mov_direct(rom, 0x31, 0)
    mov_direct(rom, 0xA8, 0xA0)
    expect(rom, 0x31, 0xB2, 0x44)
    expect_mask(rom, 0xC0, 0x40, 0, 0x45)
    mov_direct(rom, 0xA8, 0)

    mov_direct(rom, 0xCC, 0x34)
    mov_direct(rom, 0xCD, 0x12)
    mov_direct(rom, 0xC1, 0x30)
    mov_direct(rom, 0xC4, 0)
    rom.emit(0x00)
    expect(rom, 0xC4, 0x34, 0x46)
    expect(rom, 0xC5, 0x12, 0x47)
    mov_direct(rom, 0xC1, 0)
    failures.extend(range(0x40, 0x48))


def add_adc_and_port_tests(rom: Rom, failures: list[int]) -> None:
    mov_direct(rom, 0xC0, 0)
    mov_direct(rom, 0xD8, 0)
    mov_direct(rom, 0xDA, 0)
    expect_mask(rom, 0xD8, 0x10, 0x10, 0x50)
    rom.emit(*([0x00] * 16))
    expect_mask(rom, 0xD8, 0x10, 0, 0x51)
    expect(rom, 0xD9, 0x52, 0x52)
    expect_mask(rom, 0xC0, 1, 1, 0x53)

    mov_direct(rom, 0xC0, 0)
    mov_direct(rom, 0x30, 0)
    mov_direct(rom, 0xB8, 1)
    mov_direct(rom, 0xA8, 0x80)
    mov_direct(rom, 0xDA, 0)
    rom.emit(*([0x00] * 16))
    expect(rom, 0x30, 0xA1, 0x54)
    mov_direct(rom, 0xA8, 0)
    mov_direct(rom, 0xB8, 0)

    expect(rom, 0xDB, 0xA5, 0x55)
    mov_direct(rom, 0xDB, 0)
    expect(rom, 0xDB, 0xA5, 0x56)
    failures.extend(range(0x50, 0x57))


def build_rom() -> bytes:
    rom = Rom()
    failures: list[int] = []
    add_vectors(rom)
    rom.seek(0x0100)
    rom.label("main")
    add_reset_and_conflict_tests(rom, failures)
    add_storage_and_bit_tests(rom, failures)
    add_timer_tests(rom, failures)
    add_adc_and_port_tests(rom, failures)
    rom.emit(0x74, 0)
    rom.ljmp("report")

    rom.label("timer2_isr")
    mov_direct(rom, 0x31, 0xB2)
    rom.emit(0xC2, 0xC6, 0x32)
    rom.label("adc_isr")
    mov_direct(rom, 0x30, 0xA1)
    rom.emit(0xC2, 0xC0, 0x32)
    rom.label("compare_isr")
    mov_direct(rom, 0x32, 0xC3)
    rom.emit(0x32)

    for code in failures:
        rom.label(f"fail_{code:02x}")
        rom.emit(0x74, code)
        rom.ljmp("report")
    rom.label("report")
    rom.emit(0x90, 0xFF, 0x00, 0xF0, 0x80, 0xFE)
    return rom.finish()


def main() -> None:
    output = Path("/tmp/sab80c515-test.bin")
    output.write_bytes(build_rom())
    print(output)


if __name__ == "__main__":
    main()
