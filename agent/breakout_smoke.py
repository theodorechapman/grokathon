#!/usr/bin/env python3
"""End-to-end check of the agent control surface against Breakout."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from sameboy import ROOT, SameBoy


ROM = ROOT / "raw_rom" / "breakout.gb"
GAME_LOOP = 0x065D
PADDLE_X = 0xC0A0


def main() -> int:
    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary = Path(temporary_directory)
        screenshot = temporary / "breakout.png"
        state = temporary / "breakout.state"
        trace = temporary / "session.jsonl"

        with SameBoy(ROM, trace=trace) as sameboy:
            initial = sameboy.status()
            sameboy.add_breakpoint(GAME_LOOP)
            assert sameboy.request(
                {"cmd": "breakpoint", "action": "list"}
            )["breakpoints"] == [GAME_LOOP]
            stopped = sameboy.run(frames=300)
            assert stopped["stopped"] == "breakpoint", stopped
            assert stopped["registers"]["pc"] == GAME_LOOP, stopped
            assert sameboy.evaluate("pc") == GAME_LOOP

            sameboy.clear_breakpoints()
            sameboy.run(frames=2)
            paddle_before = sameboy.read(PADDLE_X)

            sameboy.save_state(state)
            replacement = bytes([(paddle_before[0] + 1) & 0xFF])
            sameboy.write(PADDLE_X, replacement)
            assert sameboy.read(PADDLE_X) == replacement
            sameboy.load_state(state)
            assert sameboy.read(PADDLE_X) == paddle_before

            sameboy.add_watchpoint(PADDLE_X, access="write")
            assert sameboy.request(
                {"cmd": "watchpoint", "action": "list"}
            )["watchpoints"] == [
                {"start": PADDLE_X, "end": PADDLE_X, "access": "write"}
            ]
            watched = sameboy.press("left", frames=10)
            assert watched["stopped"] == "watch-write", watched
            assert watched["stop_address"] == PADDLE_X, watched
            sameboy.clear_watchpoints()
            sameboy.run(frames=2)

            sameboy.screenshot(screenshot)
            assert screenshot.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")

            disassembly = sameboy.debug(f"disassemble/5 ${GAME_LOOP:04x}")
            assert disassembly.strip(), "SameBoy debugger produced no disassembly"

            result = {
                "title": initial["title"],
                "breakpoint_pc": stopped["registers"]["pc"],
                "watchpoint_address": watched["stop_address"],
                "paddle_x": paddle_before[0],
                "frames": sameboy.status()["frames"],
                "debugger_output": disassembly.splitlines()[:2],
                "screenshot_bytes": screenshot.stat().st_size,
            }
            print(json.dumps(result, indent=2))

        trace_requests = [json.loads(line) for line in trace.read_text().splitlines()]
        assert trace_requests[-1] == {"cmd": "quit"}
        assert any(request["cmd"] == "press" for request in trace_requests)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
