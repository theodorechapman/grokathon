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
            pair.run(60)
            checkpoint = pair.checkpoint(
                "same-rom",
                memory=[{"name": "wram-sample", "address": 0xC000, "length": 64}],
            )
            assert checkpoint["frame"]["exact"], checkpoint["frame"]
            assert all(item["exact"] for item in checkpoint["state"].values())
            assert checkpoint["memory"]["wram-sample"]["exact"]
            report = pair.report()
            assert report["summary"]["exact_frame_checkpoints"] == 1
            assert len(list(temporary.glob("*.png"))) == 4
            print(json.dumps(report["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
