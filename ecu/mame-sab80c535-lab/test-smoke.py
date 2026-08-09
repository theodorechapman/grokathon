#!/usr/bin/env python3

import argparse
import hashlib
import re
from pathlib import Path

EXPECTED_PATH = (0x0000, 0x0073, 0x0075, 0x0077, 0x0079, 0x007B, 0x20E0, 0x5C00)
EXPECTED_ROM_SIZE = 0xA000
EXPECTED_ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
EXPECTED_TARGET_CYCLE = 11
EXPECTED_INSTRUCTIONS_TO_TARGET = 7
TRACE_LINE = re.compile(r"^CYC=(\d+)\s+([0-9a-f]{4}):", re.IGNORECASE | re.MULTILINE)


def fail(message: str) -> None:
	raise AssertionError(message)


def verify_rom(path: Path) -> None:
	if not path.is_file():
		fail(f"canonical ROM is absent: {path}")
	data = path.read_bytes()
	if len(data) != EXPECTED_ROM_SIZE:
		fail(f"ROM size is {len(data):#x}, expected {EXPECTED_ROM_SIZE:#x}")
	digest = hashlib.sha256(data).hexdigest()
	if digest != EXPECTED_ROM_SHA256:
		fail(f"ROM SHA-256 is {digest}, expected {EXPECTED_ROM_SHA256}")


def find_ordered_path(pcs: list[int]) -> list[int]:
	position = 0
	found: list[int] = []
	for expected in EXPECTED_PATH:
		try:
			position = pcs.index(expected, position)
		except ValueError:
			fail(f"trace does not contain ordered PC {expected:04x} after {found}")
		found.append(expected)
		position += 1
	return found


def verify_trace(path: Path) -> tuple[int, int, int]:
	if not path.is_file():
		fail(f"runtime trace is absent: {path}")
	text = path.read_text(encoding="utf-8")
	matches = TRACE_LINE.findall(text)
	if not matches:
		fail("runtime trace contains no cycle-tagged instructions")

	cycles = [int(cycle) for cycle, _ in matches]
	pcs = [int(pc, 16) for _, pc in matches]
	if pcs[0] != EXPECTED_PATH[0]:
		fail(f"first traced PC is {pcs[0]:04x}, expected 0000")
	if cycles != sorted(cycles):
		fail("trace cycle counts are not monotonic")
	if "CYC=0 0000: debugger-start" not in text:
		fail("trace lacks the debugger's objective reset-PC observation")

	find_ordered_path(pcs)
	target_index = pcs.index(EXPECTED_PATH[-1])
	if target_index != EXPECTED_INSTRUCTIONS_TO_TARGET:
		fail(
			f"PC 5c00 follows {target_index} instructions,"
			f" expected {EXPECTED_INSTRUCTIONS_TO_TARGET}"
		)
	if cycles[target_index] != EXPECTED_TARGET_CYCLE:
		fail(
			f"PC 5c00 is at machine cycle {cycles[target_index]},"
			f" expected {EXPECTED_TARGET_CYCLE}"
		)
	lower_text = text.lower()
	if "unmapped sfr memory read from a9" not in lower_text:
		fail("trace lacks the first unsupported Siemens SFR read at A9")
	if "unmapped xdata memory write to a081" not in lower_text:
		fail("trace lacks the first unknown external XDATA write at A081")

	return len(matches), target_index, cycles[target_index]


def parse_args() -> argparse.Namespace:
	lab_dir = Path(__file__).resolve().parent
	parser = argparse.ArgumentParser(description="Verify the MAME SAB80C535 runtime proof")
	parser.add_argument(
		"--rom",
		type=Path,
		default=lab_dir.parent / "analysis" / "TotalCombinedROM.bin",
	)
	parser.add_argument("--trace", type=Path, default=lab_dir / "runtime-trace.log")
	return parser.parse_args()


def main() -> None:
	args = parse_args()
	verify_rom(args.rom)
	pc_count, executed_instruction_count, target_cycle = verify_trace(args.trace)
	print(
		"PASS:"
		f" {pc_count} PC observations;"
		f" reached PC 5c00 after {executed_instruction_count} instructions"
		f" at machine cycle {target_cycle}"
	)


if __name__ == "__main__":
	main()
