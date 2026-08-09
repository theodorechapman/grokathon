#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause

from pathlib import Path

ROM_SIZE = 0x1000


def build() -> bytes:
    rom = bytearray([0xFF] * ROM_SIZE)
    rom[0:3] = bytes((0x02, 0x01, 0x00))
    code = bytes(
        (
            0xE5, 0x20,             # MOV A,20h
            0xB4, 0x5A, 0x11,       # CJNE A,#5Ah,first_boot
            0xE5, 0xA9,             # MOV A,IP0
            0x54, 0x40,             # ANL A,#WDTS
            0xB4, 0x40, 0x05,       # CJNE A,#40h,fail
            0x74, 0x00,             # MOV A,#pass
            0x02, 0x01, 0x2A,       # LJMP report
            0x74, 0xE1,             # fail: MOV A,#E1h
            0x02, 0x01, 0x2A,       # LJMP report
            0x75, 0x20, 0x5A,       # first_boot: MOV 20h,#5Ah
            0xD2, 0xBE,             # SETB SWDT (start)
            0x7F, 0x7F,             # MOV R7,#127
            0x7E, 0xFF,             # outer: MOV R6,#255
            0xDE, 0xFE,             # inner: DJNZ R6,inner
            0xDF, 0xFA,             # DJNZ R7,outer
            0xD2, 0xAE,             # SETB WDT
            0x00,                   # NOP invalidates refresh window
            0xD2, 0xBE,             # SETB SWDT (must not refresh)
            0x80, 0xFE,             # wait for watchdog reset
            0x90, 0xFF, 0x00,       # report: MOV DPTR,#FF00h
            0xF0,                   # MOVX @DPTR,A
            0x80, 0xFE,             # SJMP $
        )
    )
    rom[0x100 : 0x100 + len(code)] = code
    return bytes(rom)


if __name__ == "__main__":
    output = Path(__file__).with_name("sab80c515-watchdog.bin")
    output.write_bytes(build())
    print(output)
