#!/usr/bin/env python3
"""Verify a ROM identity before allowing a runtime proof."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def verify_rom(path: Path, expected_size: int, expected_sha256: str) -> None:
	if not path.is_file():
		raise AssertionError(f"ROM is absent: {path}")
	data = path.read_bytes()
	if len(data) != expected_size:
		raise AssertionError(f"ROM size {len(data):#x} != {expected_size:#x}")
	digest = hashlib.sha256(data).hexdigest()
	if digest != expected_sha256:
		raise AssertionError(f"ROM SHA-256 {digest} != {expected_sha256}")


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("rom", type=Path)
	parser.add_argument("--size", type=lambda value: int(value, 0), required=True)
	parser.add_argument("--sha256", required=True)
	args = parser.parse_args()
	verify_rom(args.rom, args.size, args.sha256)
	print(f"PASS ROM {args.rom} size={args.size:#x} sha256={args.sha256}")


if __name__ == "__main__":
	main()
