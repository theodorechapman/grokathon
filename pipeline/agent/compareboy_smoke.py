#!/usr/bin/env python3
"""End-to-end smoke test for the dual-ROM comparison interface."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from compareboy import SameBoyPair
from sameboy import ROOT


ROM = ROOT / "raw_rom" / "postie.gbc"


def main() -> int:
    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary = Path(temporary_directory)
        with SameBoyPair(ROM, ROM, artifacts=temporary, screenshot_scale=1) as pair:
            boot = pair.boot()
            assert boot["hardware_compatible"], boot
            same_rom_trace = pair.trace(
                "same-rom-continuous",
                5,
                probes=[{"name": "wram-byte", "address": 0xC000, "type": "u8"}],
                capture_every=5,
            )
            assert same_rom_trace["first_divergence"] is None, same_rom_trace
            saved = pair.save_pair("before-branch")
            pair.run(3, buttons=["right"])
            pair.load_pair(saved)
            assert pair.elapsed_frames == 5
            checkpoint = pair.checkpoint(
                "same-rom",
                memory=[{"name": "wram-sample", "address": 0xC000, "length": 64}],
            )
            assert checkpoint["frame"]["exact"], checkpoint["frame"]
            assert all(item["exact"] for item in checkpoint["state"].values())
            assert checkpoint["memory"]["wram-sample"]["exact"]
            report = pair.report()
            assert report["summary"]["observed_trace_frames"] == 5
            assert report["summary"]["first_frame_divergence"] is None
            assert len(list(temporary.glob("*.png"))) == 8
            print(json.dumps(report["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
