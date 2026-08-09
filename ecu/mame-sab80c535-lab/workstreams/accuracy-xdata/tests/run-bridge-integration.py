#!/usr/bin/env python3
"""Exercise lockstep transport, exact boundaries, and fatal sequence handling."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

ROM_SHA256 = "e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
SCHEMA = "motronic-bridge/v1"


def arguments() -> argparse.Namespace:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mame", type=Path, default=Path("/tmp/mame-motronic-mcu-core/motronic175")
    )
    parser.add_argument(
        "--rom", type=Path, default=root / "../../../analysis/TotalCombinedROM.bin"
    )
    return parser.parse_args()


class BridgeProcess:
    def __init__(
        self, mame: Path, rom: Path, root: Path,
        timeout_ms: int = 5000,
        xdata_event_limit: int = 0,
    ) -> None:
        socket_path = root / "bridge.sock"
        rom_dir = root / "roms" / "motronic175"
        rom_dir.mkdir(parents=True)
        (root / "cfg").mkdir()
        (rom_dir / "totalcombinedrom.bin").symlink_to(rom.resolve())
        environment = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith("MOTRONIC_")
        }
        environment.update(
            {
                "MOTRONIC_BRIDGE_SOCKET": str(socket_path),
                "MOTRONIC_BRIDGE_TIMEOUT_MS": str(timeout_ms),
                "MOTRONIC_XRAM_RESET": "zero",
                "MOTRONIC_UNKNOWN_POLICY": "value",
                "MOTRONIC_UNKNOWN_VALUE": "00",
                "MOTRONIC_XDATA_EVENT_LIMIT": str(xdata_event_limit),
                "MOTRONIC_XDATA_TRACE_EVENTS": "0",
            }
        )
        command = [
            str(mame),
            "motronic175",
            "-rompath",
            str(root / "roms"),
            "-cfg_directory",
            str(root / "cfg"),
            "-video",
            "none",
            "-sound",
            "none",
            "-nothrottle",
            "-nosleep",
            "-nowriteconfig",
            "-skip_gameinfo",
            "-oslog",
        ]
        self.process = subprocess.Popen(
            command,
            cwd=root,
            env=environment,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        deadline = time.monotonic() + 10
        while not socket_path.exists():
            if self.process.poll() is not None:
                raise AssertionError(self.output())
            if time.monotonic() >= deadline:
                raise AssertionError("MAME did not create bridge socket")
            time.sleep(0.01)
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.socket.connect(str(socket_path))
        self.stream = self.socket.makefile("rwb", buffering=0)

    def send(self, message: dict[str, object]) -> None:
        self.stream.write(json.dumps(message, separators=(",", ":")).encode() + b"\n")

    def receive(self) -> dict[str, object]:
        self.socket.settimeout(5)
        line = self.stream.readline()
        if not line:
            raise AssertionError(f"bridge closed before response:\n{self.output()}")
        return json.loads(line)

    def hello(self) -> dict[str, object]:
        self.send({"schema": SCHEMA, "type": "hello"})
        return self.receive()

    def output(self) -> str:
        if self.process.poll() is None or self.process.stdout is None:
            return ""
        return self.process.stdout.read()

    def close(self) -> None:
        self.stream.close()
        self.socket.close()


def positive_case(mame: Path, rom: Path, root: Path) -> None:
    bridge = BridgeProcess(mame, rom, root)
    ready = bridge.hello()
    assert ready["type"] == "ready" and ready["cycle"] == 0
    time.sleep(0.05)
    bridge.send(
        {
            "schema": SCHEMA,
            "type": "advance",
            "seq": 0,
            "fromCycle": 0,
            "toCycle": 5000,
            "events": [
                {"cycle": 0, "kind": "xdata", "address": 0xA040, "value": 1},
                {"cycle": 0, "kind": "xdata", "address": 0xA041, "value": 2},
                {"cycle": 0, "kind": "adc", "channel": 0, "value": 127},
                {"cycle": 0, "kind": "port", "port": 3, "value": 0xFE},
                {"cycle": 100, "kind": "cc0", "state": 1},
                {"cycle": 102, "kind": "cc0", "state": 0},
            ],
        }
    )
    first = bridge.receive()
    assert first["type"] == "frame" and first["cycle"] == 5000
    assert first["fromCycle"] == 0 and first["toCycle"] == 5000
    assert isinstance(first["telemetry"], list)
    assert {"timer0", "vector0063", "vector006b"} <= set(first["counters"])
    assert first["counters"]["unknownXdataReads"] == 0
    bridge.send(
        {
            "schema": SCHEMA,
            "type": "advance",
            "seq": 1,
            "fromCycle": 5000,
            "toCycle": 6000,
            "events": [],
        }
    )
    second = bridge.receive()
    assert second["type"] == "frame" and second["cycle"] == 6000, second
    bridge.send({"schema": SCHEMA, "type": "shutdown"})
    bridge.close()
    exit_code = bridge.process.wait(timeout=5)
    output = bridge.output()
    assert exit_code == 0, output
    assert "trace_events=0 event_limit=0" in output
    assert "XEV seq=" not in output
    assert "overflow=0" in output


def negative_sequence_case(mame: Path, rom: Path, root: Path) -> None:
    bridge = BridgeProcess(mame, rom, root)
    bridge.hello()
    bridge.send(
        {
            "schema": SCHEMA,
            "type": "advance",
            "seq": 1,
            "fromCycle": 0,
            "toCycle": 10,
            "events": [],
        }
    )
    error = bridge.receive()
    assert error["type"] == "error" and error["fatal"] is True
    bridge.close()
    assert bridge.process.wait(timeout=5) != 0


def timeout_case(mame: Path, rom: Path, root: Path) -> None:
    bridge = BridgeProcess(mame, rom, root, timeout_ms=100)
    bridge.hello()
    error = bridge.receive()
    assert error["type"] == "error" and "timeout" in str(error["message"])
    bridge.close()
    assert bridge.process.wait(timeout=5) != 0


def disconnect_case(mame: Path, rom: Path, root: Path) -> None:
    bridge = BridgeProcess(mame, rom, root)
    bridge.hello()
    bridge.close()
    assert bridge.process.wait(timeout=5) != 0


def bounded_xdata_case(mame: Path, rom: Path, root: Path) -> None:
    bridge = BridgeProcess(mame, rom, root, xdata_event_limit=100)
    bridge.hello()
    bridge.send(
        {
            "schema": SCHEMA,
            "type": "advance",
            "seq": 0,
            "fromCycle": 0,
            "toCycle": 5000,
            "events": [],
        }
    )
    try:
        bridge.receive()
    except AssertionError:
        pass
    bridge.close()
    bridge.process.wait(timeout=5)
    output = bridge.output()
    assert "XMODEL overflow limit=100" in output


def main() -> None:
    args = arguments()
    if not args.mame.is_file():
        raise AssertionError(f"MAME target absent: {args.mame}")
    if hashlib.sha256(args.rom.read_bytes()).hexdigest() != ROM_SHA256:
        raise AssertionError("canonical ROM identity mismatch")
    with tempfile.TemporaryDirectory(prefix="motronic-bridge-positive-") as path:
        positive_case(args.mame.resolve(), args.rom.resolve(), Path(path))
    with tempfile.TemporaryDirectory(prefix="motronic-bridge-negative-") as path:
        negative_sequence_case(args.mame.resolve(), args.rom.resolve(), Path(path))
    with tempfile.TemporaryDirectory(prefix="motronic-bridge-timeout-") as path:
        timeout_case(args.mame.resolve(), args.rom.resolve(), Path(path))
    with tempfile.TemporaryDirectory(prefix="motronic-bridge-disconnect-") as path:
        disconnect_case(args.mame.resolve(), args.rom.resolve(), Path(path))
    with tempfile.TemporaryDirectory(prefix="motronic-bridge-bounded-xdata-") as path:
        bounded_xdata_case(args.mame.resolve(), args.rom.resolve(), Path(path))
    print("PASS: bridge lockstep, events, boundaries, and fatal I/O gates")


if __name__ == "__main__":
    main()
