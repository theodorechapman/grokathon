#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

from pathlib import Path


class Rom:
    def __init__(self) -> None:
        self.data = bytearray([0xFF] * 0x1000)
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


def mov(rom: Rom, address: int, value: int) -> None:
    rom.emit(0x75, address, value)


def expect(rom: Rom, address: int, value: int, code: int, failures: list[int]) -> None:
    rom.emit(0xE5, address)
    rom.cjne(value, f"fail_{code:02x}")
    failures.append(code)


def expect_mask(
    rom: Rom, address: int, mask: int, value: int, code: int, failures: list[int]
) -> None:
    rom.emit(0xE5, address, 0x54, mask)
    rom.cjne(value, f"fail_{code:02x}")
    failures.append(code)


def add_vectors(rom: Rom) -> None:
    for address, label in (
        (0x0000, "main"),
        (0x002B, "timer2_isr"),
        (0x0043, "adc_isr"),
        (0x004B, "iex2_isr"),
        (0x005B, "compare_isr"),
    ):
        rom.seek(address)
        rom.ljmp(label)


def add_sfr_tests(rom: Rom, failures: list[int]) -> None:
    registers = (
        0xA9, 0xB8, 0xB9, 0xC0, 0xC1, 0xC2, 0xC3, 0xC4, 0xC5,
        0xC6, 0xC7, 0xC8, 0xCA, 0xCB, 0xCC, 0xCD, 0xD8, 0xD9, 0xDA,
    )
    for code, address in enumerate(registers, 1):
        expect(rom, address, 0, code, failures)
    mov(rom, 0xA9, 0xFF)
    expect(rom, 0xA9, 0x3F, 0x20, failures)
    mov(rom, 0xB9, 0xFF)
    expect(rom, 0xB9, 0x3F, 0x21, failures)
    mov(rom, 0xB8, 0x2A)
    expect(rom, 0xB8, 0x2A, 0x22, failures)
    rom.emit(0xD2, 0xA9)
    expect_mask(rom, 0xA8, 2, 2, 0x23, failures)
    rom.emit(0xD2, 0xBE)
    expect_mask(rom, 0xA9, 0x40, 0x40, 0x24, failures)
    rom.emit(0x00, 0x00)
    expect_mask(rom, 0xB8, 0x40, 0, 0x25, failures)


def add_storage_tests(rom: Rom, failures: list[int]) -> None:
    mov(rom, 0xC0, 0)
    rom.emit(0xD2, 0xC6)
    expect(rom, 0xC0, 0x40, 0x30, failures)
    rom.emit(0xC2, 0xC6)
    for index, address in enumerate(range(0xC2, 0xC8)):
        mov(rom, address, 0x41 + index)
        expect(rom, address, 0x41 + index, 0x31 + index, failures)
    for index, address in enumerate(range(0xCA, 0xCE)):
        mov(rom, address, 0x51 + index)
        expect(rom, address, 0x51 + index, 0x37 + index, failures)
    mov(rom, 0xD9, 0xAB)
    expect(rom, 0xD9, 0xAB, 0x3B, failures)
    expect(rom, 0xDB, 0xA5, 0x3C, failures)


def add_timer_tests(rom: Rom, failures: list[int]) -> None:
    mov(rom, 0xC8, 0x04)
    mov(rom, 0xCC, 0x34)
    mov(rom, 0xCD, 0x12)
    rom.emit(0x00, 0x00, 0x00, 0x00)
    expect(rom, 0xCC, 0x34, 0x40, failures)
    expect(rom, 0xCD, 0x12, 0x41, failures)
    mov(rom, 0xC8, 0)
    mov(rom, 0xC0, 0)
    mov(rom, 0xC1, 0x08)
    mov(rom, 0xC2, 0x04)
    mov(rom, 0xC3, 0)
    mov(rom, 0xCC, 0)
    mov(rom, 0xCD, 0)
    mov(rom, 0xC8, 1)
    rom.emit(0x00, 0x00)
    expect_mask(rom, 0xC0, 8, 8, 0x42, failures)
    mov(rom, 0x32, 0)
    mov(rom, 0xB8, 8)
    mov(rom, 0xA8, 0x80)
    expect(rom, 0x32, 0xC3, 0x43, failures)
    mov(rom, 0xA8, 0)
    mov(rom, 0xC8, 0)
    mov(rom, 0xC0, 0)
    mov(rom, 0xCC, 0xFC)
    mov(rom, 0xCD, 0xFF)
    mov(rom, 0xC8, 1)
    rom.emit(0x00, 0x00)
    mov(rom, 0xC8, 0)
    expect_mask(rom, 0xC0, 0x40, 0x40, 0x44, failures)
    mov(rom, 0x31, 0)
    mov(rom, 0xA8, 0xA0)
    expect(rom, 0x31, 0xB2, 0x45, failures)
    mov(rom, 0xA8, 0)
    mov(rom, 0xCC, 0x34)
    mov(rom, 0xCD, 0x12)
    mov(rom, 0xC1, 0x30)
    mov(rom, 0xC4, 0)
    rom.emit(0x00)
    expect(rom, 0xC4, 0x34, 0x46, failures)
    expect(rom, 0xC5, 0x12, 0x47, failures)


def add_adc_irq_watchdog_tests(rom: Rom, failures: list[int]) -> None:
    mov(rom, 0xA8, 0)
    mov(rom, 0xB8, 0)
    mov(rom, 0xC0, 0)
    mov(rom, 0xD8, 0)
    mov(rom, 0xD9, 0x77)
    mov(rom, 0xDA, 0)
    expect_mask(rom, 0xD8, 0x10, 0x10, 0x50, failures)
    expect(rom, 0xD9, 0x77, 0x51, failures)
    rom.emit(*([0x00] * 14))
    expect_mask(rom, 0xD8, 0x10, 0, 0x52, failures)
    expect(rom, 0xD9, 0x52, 0x53, failures)
    mov(rom, 0x34, 0)
    mov(rom, 0x35, 0)
    mov(rom, 0xA9, 2)
    mov(rom, 0xB9, 0)
    mov(rom, 0xC0, 3)
    mov(rom, 0xB8, 3)
    mov(rom, 0xA8, 0x80)
    rom.emit(0x00)
    expect(rom, 0x34, 0xB1, 0x54, failures)
    expect(rom, 0x35, 0xA1, 0x55, failures)
    mov(rom, 0xA8, 0)
    rom.emit(0xD2, 0xAE, 0xD2, 0xBE, 0x00, 0x00)
    expect_mask(rom, 0xA9, 0x40, 0x40, 0x56, failures)
    expect_mask(rom, 0xA8, 0x40, 0, 0x57, failures)
    expect_mask(rom, 0xB8, 0x40, 0, 0x58, failures)


def build() -> bytes:
    rom = Rom()
    failures: list[int] = []
    add_vectors(rom)
    rom.seek(0x0100)
    rom.label("main")
    add_sfr_tests(rom, failures)
    add_storage_tests(rom, failures)
    add_timer_tests(rom, failures)
    add_adc_irq_watchdog_tests(rom, failures)
    rom.emit(0x74, 0)
    rom.ljmp("report")
    for label, address, value, clear in (
        ("timer2_isr", 0x31, 0xB2, 0xC6),
        ("adc_isr", 0x35, 0xA1, 0xC0),
        ("iex2_isr", 0x34, 0xB1, 0xC1),
        ("compare_isr", 0x32, 0xC3, 0xC3),
    ):
        rom.label(label)
        mov(rom, address, value)
        rom.emit(0xC2, clear, 0x32)
    for code in failures:
        rom.label(f"fail_{code:02x}")
        rom.emit(0x74, code)
        rom.ljmp("report")
    rom.label("report")
    rom.emit(0x90, 0xFF, 0x00, 0xF0, 0x80, 0xFE)
    return rom.finish()


if __name__ == "__main__":
    output = Path(__file__).with_name("sab80c515-conformance.bin")
    output.write_bytes(build())
    print(output)
