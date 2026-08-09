#!/usr/bin/env python3
"""Build a tiny ROM exercising 8051 core semantics omitted by reset."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

ROM_SIZE = 0x1000


def build() -> bytes:
    rom = bytearray([0xFF] * ROM_SIZE)
    rom[0:3] = bytes([0x02, 0x01, 0x00])
    rom[0x100:0x124] = bytes([
        0x75, 0x81, 0x30,       # MOV SP,#30
        0x74, 0x7F,             # MOV A,#7F
        0x24, 0x01,             # ADD A,#01
        0xD3,                   # SETB C
        0x94, 0x01,             # SUBB A,#01
        0xC0, 0xE0,             # PUSH ACC
        0xE4,                   # CLR A
        0xD0, 0xF0,             # POP B
        0x90, 0x01, 0x40,       # MOV DPTR,#0140
        0x74, 0x02,             # MOV A,#02
        0x93,                   # MOVC A,@A+DPTR
        0x90, 0xA0, 0x55,       # MOV DPTR,#A055
        0xF0,                   # MOVX @DPTR,A
        0xC2, 0x20,             # CLR bit 20
        0xD2, 0x20,             # SETB bit 20
        0x20, 0x20, 0x02,       # JB bit 20,+2
        0x74, 0x00,             # skipped
        0x80, 0xFE,             # terminal SJMP
    ])
    rom[0x140:0x144] = bytes([0xDE, 0xAD, 0xBE, 0xEF])
    return bytes(rom)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = build()
    args.output.write_bytes(data)
    print(f"{hashlib.sha256(data).hexdigest()}  {args.output}")


if __name__ == "__main__":
    main()
