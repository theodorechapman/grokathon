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

            sameboy.run(frames=180)
            sameboy.screenshot(screenshot, scale=1)
            png = screenshot.read_bytes()
            assert len(png) > 1024, "Postie screenshot was unexpectedly empty"

            result = sameboy.status()
            result["screenshot_bytes"] = len(png)
            print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
