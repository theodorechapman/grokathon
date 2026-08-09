#!/usr/bin/env python3
"""Pure source-shape gates for the later MAME integration."""

from __future__ import annotations

import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_REPO = _ROOT.parents[3]


class IntegrationTests(unittest.TestCase):
	def test_adapter_enters_through_p3_callbacks(self) -> None:
		patch = (_ROOT / "patches/motronic175-kw71.patch").read_text()
		self.assertIn("port_in_cb<3>().set(m_kw71", patch)
		self.assertIn("port_out_cb<3>().set(m_kw71", patch)
		self.assertIn("MOTRONIC175_KW71(config, m_kw71, 0)", patch)

	def test_adapter_does_not_write_firmware_state(self) -> None:
		source = (_ROOT / "mame/motronic175-kw71.cpp").read_text()
		for forbidden in ("SBUF", "INTMEM", "AS_DATA", "space(AS_DATA)", "state_int"):
			self.assertNotIn(forbidden, source)

	def test_adapter_is_composed_in_combined_driver(self) -> None:
		driver_path = (
			_REPO
			/ "ecu/mame-sab80c535-lab/workstreams/accuracy-xdata/src/motronic175.cpp"
		)
		state_path = driver_path.with_name("motronic175-state.h")
		driver = driver_path.read_text()
		state = state_path.read_text()
		for marker in (
			'(m_xdata->read_port(3) & 0xfe) | (m_kw71->p3_r() & 0x01)',
			"m_kw71->p3_w(data);",
			"MOTRONIC175_KW71(config, m_kw71, 0);",
		):
			self.assertIn(marker, driver)
		for marker in (
			'#include "motronic175-kw71.h"',
			"required_device<motronic175_kw71_device> m_kw71;",
		):
			self.assertIn(marker, state)

	def test_cpp_parser_supports_fixture_record_kinds(self) -> None:
		source = (_ROOT / "mame/motronic175-kw71.cpp").read_text()
		for token in ('kind == "bit-us"', 'kind == "line"', 'kind != "byte"'):
			self.assertIn(token, source)

	def test_every_authored_file_is_under_250_lines(self) -> None:
		text_suffixes = {".cpp", ".h", ".json", ".md", ".patch", ".py", ".stim"}
		for path in _ROOT.rglob("*"):
			if path.is_file() and (path.suffix in text_suffixes or path.name == "run-tests.sh"):
				lines = len(path.read_text(encoding="utf-8").splitlines())
				self.assertLess(lines, 250, f"{path.relative_to(_ROOT)} has {lines} lines")


if __name__ == "__main__":
	unittest.main()
