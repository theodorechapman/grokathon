#!/usr/bin/env python3
"""Source-shape gates for the composed accuracy-xdata target."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
ACCURACY = ROOT.parent / "accuracy-xdata"


class IntegratedProviderTest(unittest.TestCase):
	def test_build_installs_provider(self) -> None:
		build = (ACCURACY / "build.sh").read_text()
		self.assertIn('BOARD_ROOT="$ROOT/../signals-board-io"', build)
		self.assertIn('"$BOARD_ROOT"/src/*', build)
		self.assertIn("motronic175-signal-provider.cpp", build)

	def test_driver_routes_input_ports(self) -> None:
		driver = (ACCURACY / "src/motronic175.cpp").read_text()
		for marker in (
			"port_in_cb<3>().set(FUNC(motronic175_state::p3_r))",
			"port_in_cb<5>().set(FUNC(motronic175_state::p5_r))",
			"port_in_cb<6>().set(FUNC(motronic175_state::p6_r))",
		):
			self.assertIn(marker, driver)

	def test_xdata_keeps_inputs_and_outputs_separate(self) -> None:
		header = (ACCURACY / "src/motronic175-xdata.h").read_text()
		source = (ACCURACY / "src/motronic175-xdata.cpp").read_text()
		self.assertIn("motronic175_signal_provider m_signals", header)
		self.assertIn("m_output_latches", header)
		self.assertIn("m_signals.read_xdata(address, m_cycle)", source)
		self.assertNotIn(
			"return m_output_latches[address - 0xa040]",
			source,
		)


if __name__ == "__main__":
	unittest.main()
