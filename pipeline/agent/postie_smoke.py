#!/usr/bin/env python3
"""Boot the open-licensed CGB/MBC5 Postie benchmark."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from sameboy import ROOT, SameBoy


ROM = ROOT / "raw_rom" / "postie.gbc"


def main() -> int:
    with tempfile.TemporaryDirectory() as temporary_directory:
        screenshot = Path(temporary_directory) / "postie.png"
        with SameBoy(ROM) as sameboy:
            initial = sameboy.status()
            assert initial["title"] == "POSTIE", initial
            assert initial["hardware"]["model"] == "cgb", initial
            assert initial["hardware"]["cgb_mode"], initial
            assert initial["cartridge"]["rom_banks"] == 16, initial
            assert initial["cartridge"]["type"] == 0x1B, initial

            sameboy.execution_trace()
            sameboy.asset_trace()
            # The CGB boot animation is substantially longer than the DMG
            # path. Run far enough to prove the cartridge, not just its boot
            # ROM, is executing.
            sameboy.run(frames=600)
            sameboy.execution_trace(False)
            sameboy.asset_trace(False)
            assert sameboy.read(0xFF50)[0] & 1, "CGB boot ROM never unmapped"
            sameboy.screenshot(screenshot, scale=1)
            png = screenshot.read_bytes()
            assert len(png) > 1024, "Postie screenshot was unexpectedly empty"

            coverage = sameboy.execution_coverage()
            assert coverage["count"] > 100, coverage
            assert any(bank["bank"] > 1 for bank in coverage["banks"]), coverage
            assert coverage["bank_events"], coverage
            video = sameboy.video_state()
            assert [item["bank"] for item in video["artifacts"] if item["kind"] == "vram"] == [0, 1]
            assert len([item for item in video["artifacts"] if item["kind"] == "palette"]) == 2

            result = sameboy.status()
            result["screenshot_bytes"] = len(png)
            result["execution_coverage"] = {
                "addresses": coverage["count"],
                "banks": [bank["bank"] for bank in coverage["banks"]],
                "bank_events": len(coverage["bank_events"]),
            }
            result["asset_runs"] = len(sameboy.asset_runs())
            result["video_artifacts"] = video["artifacts"]
            print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
