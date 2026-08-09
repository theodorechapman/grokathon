#!/usr/bin/env python3
"""Build deterministic 8051 firmware that probes implemented MAME features."""

from __future__ import annotations

import argparse
import hashlib
import zlib
from pathlib import Path

ROM_SIZE = 0x1000


def build_stimulus_rom() -> bytes:
	image = bytearray([0xFF] * ROM_SIZE)
	segments = {
		0x0000: bytes.fromhex("02 01 00"),  # LJMP main
		0x0003: bytes.fromhex("02 02 00"),  # generic external-0 vector
		0x000B: bytes.fromhex("02 02 20"),  # generic Timer-0 vector
		0x0023: bytes.fromhex("02 02 40"),  # generic UART vector
		0x0100: bytes.fromhex(
			"75 81 30 "  # SP = 0x30
			"75 90 00 75 90 AC "  # observable P1 transitions
			"75 D8 00 E5 D9 90 A1 00 F0 "  # ADC0 -> XDATA A100
			"75 D8 01 E5 D9 A3 F0 "  # ADC1 -> XDATA A101
			"75 89 22 "  # Timer 0/1 mode 2
			"75 8C 80 75 8A 80 "  # Timer 0 reload/current
			"75 8D FD 75 8B FD "  # Timer 1 UART baud source
			"75 98 50 "  # UART mode 1, receive enabled
			"75 A8 93 "  # EA, serial, Timer 0, external 0
			"D2 88 D2 8C D2 8E "  # edge INT0; run Timer 0/1
			"75 99 A5 "  # transmit byte
			"80 FE"  # bounded idle loop
		),
		0x0200: bytes.fromhex(
			"90 A1 10 74 E0 F0 32"  # external-0 marker, RETI
		),
		0x0220: bytes.fromhex("B2 95 32"),  # toggle P1.5, RETI
		0x0240: bytes.fromhex(
			"E5 99 90 A1 12 F0 C2 98 C2 99 32"  # UART byte marker
		),
	}
	for address, payload in segments.items():
		end = address + len(payload)
		if end > ROM_SIZE:
			raise ValueError(f"segment at {address:#x} exceeds ROM")
		image[address:end] = payload
	return bytes(image)


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("output", type=Path)
	args = parser.parse_args()
	data = build_stimulus_rom()
	args.output.parent.mkdir(parents=True, exist_ok=True)
	args.output.write_bytes(data)
	print(f"size={len(data)}")
	print(f"crc32={zlib.crc32(data):08x}")
	print(f"sha1={hashlib.sha1(data).hexdigest()}")
	print(f"sha256={hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
	main()
