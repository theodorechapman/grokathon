#!/usr/bin/env python3
"""Safe Python control layer over the small native SameBoy bridge."""

from __future__ import annotations

import argparse
import binascii
import ctypes
import functools
import json
import struct
import sys
import zlib
from pathlib import Path
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LIBRARY = ROOT / "bin" / (
    "libgrokboy.dylib" if sys.platform == "darwin" else "libgrokboy.so"
)
DEFAULT_BOOT_ROM = ROOT / "vendor" / "SameBoy" / "build" / "bin" / "BootROMs" / "dmg_boot.bin"
DEFAULT_CGB_BOOT_ROM = ROOT / "vendor" / "SameBoy" / "build" / "bin" / "BootROMs" / "cgb_boot.bin"
SCREEN_WIDTH = 160
SCREEN_HEIGHT = 144
FRAME_RGB_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT * 3
MAX_MEMORY_TRANSFER = 4096
# Screenshots are nearest-neighbor upscaled so vision models can read them;
# the native 160x144 frame is too small.
DEFAULT_SCREENSHOT_SCALE = 3

STOP_REASONS = {
    0: "frame-limit",
    1: "breakpoint",
    2: "watch-read",
    3: "watch-write",
    4: "until-pc",
    5: "instruction-limit",
}
KEYS = {
    "right": 0,
    "left": 1,
    "up": 2,
    "down": 3,
    "a": 4,
    "b": 5,
    "select": 6,
    "start": 7,
}
REGISTERS = {
    "af": 0,
    "bc": 1,
    "de": 2,
    "hl": 3,
    "sp": 4,
    "pc": 5,
    "a": 6,
    "f": 7,
    "b": 8,
    "c": 9,
    "d": 10,
    "e": 11,
    "h": 12,
    "l": 13,
}
WATCH_ACCESS = {"read": 1, "write": 2, "rw": 3}


class HarnessError(RuntimeError):
    pass


class _Registers(ctypes.Structure):
    _fields_ = [
        ("af", ctypes.c_uint16),
        ("bc", ctypes.c_uint16),
        ("de", ctypes.c_uint16),
        ("hl", ctypes.c_uint16),
        ("sp", ctypes.c_uint16),
        ("pc", ctypes.c_uint16),
        ("a", ctypes.c_uint8),
        ("f", ctypes.c_uint8),
        ("b", ctypes.c_uint8),
        ("c", ctypes.c_uint8),
        ("d", ctypes.c_uint8),
        ("e", ctypes.c_uint8),
        ("h", ctypes.c_uint8),
        ("l", ctypes.c_uint8),
    ]


class _Stop(ctypes.Structure):
    _fields_ = [
        ("reason", ctypes.c_uint32),
        ("address", ctypes.c_uint16),
        ("value", ctypes.c_uint8),
        ("executed", ctypes.c_uint64),
        ("frames", ctypes.c_uint64),
        ("instructions", ctypes.c_uint64),
        ("registers", _Registers),
    ]


class _Watchpoint(ctypes.Structure):
    _fields_ = [
        ("start", ctypes.c_uint16),
        ("end", ctypes.c_uint16),
        ("access", ctypes.c_uint8),
    ]


class _HardwareInfo(ctypes.Structure):
    _fields_ = [
        ("model", ctypes.c_uint16),
        ("rom_bank", ctypes.c_uint16),
        ("ram_bank", ctypes.c_uint16),
        ("vram_bank", ctypes.c_uint16),
        ("cgb_mode", ctypes.c_uint8),
    ]


def _configure_library(library: ctypes.CDLL) -> ctypes.CDLL:
    handle = ctypes.c_void_p
    byte_pointer = ctypes.POINTER(ctypes.c_uint8)

    library.sb_create.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.POINTER(handle)]
    library.sb_create.restype = ctypes.c_int
    library.sb_destroy.argtypes = [handle]
    library.sb_destroy.restype = None
    library.sb_last_error.argtypes = [handle]
    library.sb_last_error.restype = ctypes.c_char_p

    library.sb_get_title.argtypes = [handle, ctypes.c_void_p, ctypes.c_size_t]
    library.sb_get_title.restype = ctypes.c_int
    library.sb_get_hardware_info.argtypes = [handle, ctypes.POINTER(_HardwareInfo)]
    library.sb_get_hardware_info.restype = ctypes.c_int
    library.sb_get_registers.argtypes = [handle, ctypes.POINTER(_Registers)]
    library.sb_get_registers.restype = ctypes.c_int
    library.sb_set_register.argtypes = [handle, ctypes.c_uint32, ctypes.c_uint16]
    library.sb_set_register.restype = ctypes.c_int
    library.sb_get_frames.argtypes = [handle]
    library.sb_get_frames.restype = ctypes.c_uint64
    library.sb_get_instructions.argtypes = [handle]
    library.sb_get_instructions.restype = ctypes.c_uint64

    library.sb_run.argtypes = [
        handle,
        ctypes.c_uint64,
        ctypes.c_uint64,
        ctypes.c_bool,
        ctypes.c_uint16,
        ctypes.POINTER(_Stop),
    ]
    library.sb_run.restype = ctypes.c_int
    library.sb_step.argtypes = [handle, ctypes.POINTER(_Stop)]
    library.sb_step.restype = ctypes.c_int
    library.sb_set_key.argtypes = [handle, ctypes.c_uint32, ctypes.c_bool]
    library.sb_set_key.restype = ctypes.c_int

    library.sb_read_memory.argtypes = [handle, ctypes.c_uint16, byte_pointer, ctypes.c_size_t]
    library.sb_read_memory.restype = ctypes.c_int
    library.sb_write_memory.argtypes = [handle, ctypes.c_uint16, byte_pointer, ctypes.c_size_t]
    library.sb_write_memory.restype = ctypes.c_int

    library.sb_add_breakpoint.argtypes = [handle, ctypes.c_uint16]
    library.sb_add_breakpoint.restype = ctypes.c_int
    library.sb_remove_breakpoint.argtypes = [handle, ctypes.c_uint16]
    library.sb_remove_breakpoint.restype = ctypes.c_int
    library.sb_clear_breakpoints.argtypes = [handle]
    library.sb_clear_breakpoints.restype = None
    library.sb_breakpoint_count.argtypes = [handle]
    library.sb_breakpoint_count.restype = ctypes.c_size_t
    library.sb_get_breakpoint.argtypes = [
        handle,
        ctypes.c_size_t,
        ctypes.POINTER(ctypes.c_uint16),
    ]
    library.sb_get_breakpoint.restype = ctypes.c_int

    library.sb_add_watchpoint.argtypes = [
        handle,
        ctypes.c_uint16,
        ctypes.c_uint16,
        ctypes.c_uint8,
    ]
    library.sb_add_watchpoint.restype = ctypes.c_int
    library.sb_remove_watchpoint.argtypes = [handle, ctypes.c_uint16, ctypes.c_uint16]
    library.sb_remove_watchpoint.restype = ctypes.c_int
    library.sb_clear_watchpoints.argtypes = [handle]
    library.sb_clear_watchpoints.restype = None
    library.sb_watchpoint_count.argtypes = [handle]
    library.sb_watchpoint_count.restype = ctypes.c_size_t
    library.sb_get_watchpoint.argtypes = [
        handle,
        ctypes.c_size_t,
        ctypes.POINTER(_Watchpoint),
    ]
    library.sb_get_watchpoint.restype = ctypes.c_int

    library.sb_evaluate.argtypes = [
        handle,
        ctypes.c_char_p,
        ctypes.POINTER(ctypes.c_uint16),
        ctypes.POINTER(ctypes.c_uint16),
    ]
    library.sb_evaluate.restype = ctypes.c_int
    library.sb_debug.argtypes = [
        handle,
        ctypes.c_char_p,
        ctypes.c_void_p,
        ctypes.c_size_t,
    ]
    library.sb_debug.restype = ctypes.c_int
    library.sb_load_symbols.argtypes = [handle, ctypes.c_char_p]
    library.sb_load_symbols.restype = ctypes.c_int

    library.sb_set_call_trace.argtypes = [handle, ctypes.c_bool]
    library.sb_set_call_trace.restype = ctypes.c_int
    library.sb_clear_call_trace.argtypes = [handle]
    library.sb_clear_call_trace.restype = ctypes.c_int
    library.sb_get_call_targets.argtypes = [
        handle, ctypes.POINTER(ctypes.c_uint32), ctypes.c_size_t]
    library.sb_get_call_targets.restype = ctypes.c_size_t

    library.sb_set_asset_trace.argtypes = [handle, ctypes.c_bool]
    library.sb_set_asset_trace.restype = ctypes.c_int
    library.sb_clear_asset_trace.argtypes = [handle]
    library.sb_clear_asset_trace.restype = ctypes.c_int
    library.sb_get_asset_runs.argtypes = [
        handle, ctypes.POINTER(ctypes.c_uint16), ctypes.c_size_t]
    library.sb_get_asset_runs.restype = ctypes.c_size_t

    library.sb_copy_frame_rgb.argtypes = [handle, byte_pointer, ctypes.c_size_t]
    library.sb_copy_frame_rgb.restype = ctypes.c_int
    library.sb_save_state.argtypes = [handle, ctypes.c_char_p]
    library.sb_save_state.restype = ctypes.c_int
    library.sb_load_state.argtypes = [handle, ctypes.c_char_p]
    library.sb_load_state.restype = ctypes.c_int
    library.sb_reset.argtypes = [handle, ctypes.c_bool]
    library.sb_reset.restype = ctypes.c_int
    library.sb_reload.argtypes = [handle]
    library.sb_reload.restype = ctypes.c_int
    return library


@functools.lru_cache(maxsize=None)
def _load_library(path: str) -> ctypes.CDLL:
    try:
        return _configure_library(ctypes.CDLL(path))
    except OSError as error:
        raise HarnessError(f"Could not load native harness {path}: {error}") from error


def _integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        raise HarnessError(f"{name} must be an integer")
    if isinstance(value, str):
        try:
            if value.startswith("$"):
                value = int(value[1:], 16)
            else:
                value = int(value, 0)
        except ValueError as error:
            raise HarnessError(f"{name} must be an integer") from error
    if not isinstance(value, int) or not minimum <= value <= maximum:
        raise HarnessError(f"{name} must be in range {minimum}..{maximum}")
    return value


def _register_dict(registers: _Registers) -> dict[str, int]:
    return {name: int(getattr(registers, name)) for name in REGISTERS}


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    payload = kind + data
    return struct.pack(">I", len(data)) + payload + struct.pack(">I", binascii.crc32(payload))


def _write_png(path: Path, rgb: bytes, scale: int = 1) -> None:
    row_size = SCREEN_WIDTH * 3
    rows = []
    for offset in range(0, len(rgb), row_size):
        row = rgb[offset : offset + row_size]
        if scale > 1:
            row = b"".join(row[i : i + 3] * scale for i in range(0, row_size, 3))
        rows.append((b"\0" + row) * scale)
    header = struct.pack(
        ">IIBBBBB", SCREEN_WIDTH * scale, SCREEN_HEIGHT * scale, 8, 2, 0, 0, 0
    )
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(b"".join(rows), level=1))
        + _png_chunk(b"IEND", b"")
    )


class SameBoy:
    """A synchronous, validated controller for one SameBoy instance."""

    def __init__(
        self,
        rom: str | Path,
        *,
        library: str | Path = DEFAULT_LIBRARY,
        boot_rom: str | Path | None = None,
        trace: str | Path | None = None,
    ) -> None:
        self.rom = Path(rom).resolve()
        self._header = self.rom.read_bytes()[0x100:0x150]
        if len(self._header) != 0x50:
            raise HarnessError("ROM is too small for a Game Boy cartridge header")
        self.cgb_capable = bool(self._header[0x43] & 0x80)
        if boot_rom is None:
            boot_rom = DEFAULT_CGB_BOOT_ROM if self.cgb_capable else DEFAULT_BOOT_ROM
        self.boot_rom = Path(boot_rom).resolve()
        self._library = _load_library(str(Path(library).resolve()))
        self._handle = ctypes.c_void_p()
        result = self._library.sb_create(
            str(self.rom).encode(),
            str(self.boot_rom).encode(),
            ctypes.byref(self._handle),
        )
        if result != 0:
            message = self._library.sb_last_error(None).decode(errors="replace")
            raise HarnessError(message or "failed to create SameBoy")
        self._trace = None
        if trace is not None:
            try:
                self._trace = Path(trace).resolve().open(
                    "a", encoding="utf-8", buffering=1
                )
            except OSError as error:
                self._destroy()
                raise HarnessError(f"Could not open trace: {error}") from error

    def _check(self, result: int) -> None:
        if result == 0:
            return
        message = self._library.sb_last_error(self._handle).decode(errors="replace")
        raise HarnessError(message or "native harness operation failed")

    def _stop_dict(self, stop: _Stop) -> dict[str, Any]:
        return {
            "ok": True,
            "stopped": STOP_REASONS.get(stop.reason, "unknown"),
            "stop_address": int(stop.address),
            "stop_value": int(stop.value),
            "executed": int(stop.executed),
            "frames": int(stop.frames),
            "instructions": int(stop.instructions),
            "registers": _register_dict(stop.registers),
        }

    def _native_registers(self) -> dict[str, int]:
        registers = _Registers()
        self._check(self._library.sb_get_registers(self._handle, ctypes.byref(registers)))
        return _register_dict(registers)

    def _hardware_info(self) -> dict[str, Any]:
        value = _HardwareInfo()
        self._check(self._library.sb_get_hardware_info(self._handle, ctypes.byref(value)))
        return {
            "model": "cgb" if value.model & 0x200 else "dmg",
            "model_id": value.model,
            "cgb_mode": bool(value.cgb_mode),
            "rom_bank": value.rom_bank,
            "ram_bank": value.ram_bank,
            "vram_bank": value.vram_bank,
        }

    def _cartridge_info(self) -> dict[str, Any]:
        rom_size_code = self._header[0x48]
        ram_size_code = self._header[0x49]
        rom_banks = {0x52: 72, 0x53: 80, 0x54: 96}.get(
            rom_size_code, 2 << rom_size_code if rom_size_code <= 8 else 0
        )
        ram_bytes = {
            0x00: 0, 0x01: 2 * 1024, 0x02: 8 * 1024,
            0x03: 32 * 1024, 0x04: 128 * 1024, 0x05: 64 * 1024,
        }.get(ram_size_code, 0)
        cartridge_type = self._header[0x47]
        return {
            "cgb_flag": self._header[0x43],
            "type": cartridge_type,
            "rom_size_code": rom_size_code,
            "rom_banks": rom_banks,
            "rom_bytes": rom_banks * 0x4000,
            "ram_size_code": ram_size_code,
            "ram_bytes": ram_bytes,
            "ram_banks": (ram_bytes + 0x1FFF) // 0x2000,
        }

    def _dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
        command = request.get("cmd")
        if not isinstance(command, str):
            raise HarnessError("request must contain a cmd string")

        if command in {"status", "registers"}:
            registers = self._native_registers()
            if command == "registers":
                return {"ok": True, "registers": registers}
            title = ctypes.create_string_buffer(17)
            self._check(self._library.sb_get_title(self._handle, title, len(title)))
            return {
                "ok": True,
                "rom": str(self.rom),
                "title": title.value.decode(errors="replace"),
                "boot_rom": str(self.boot_rom),
                "hardware": self._hardware_info(),
                "cartridge": self._cartridge_info(),
                "frames": int(self._library.sb_get_frames(self._handle)),
                "instructions": int(self._library.sb_get_instructions(self._handle)),
                "registers": registers,
            }

        if command == "run":
            frames = _integer(request.get("frames", 1), "frames", 1, 2**63 - 1)
            limit = _integer(
                request.get("max_instructions", 50_000_000),
                "max_instructions",
                1,
                2**63 - 1,
            )
            has_until = "until_pc" in request
            until_pc = (
                _integer(request["until_pc"], "until_pc", 0, 0xFFFF)
                if has_until
                else 0
            )
            stop = _Stop()
            self._check(
                self._library.sb_run(
                    self._handle,
                    frames,
                    limit,
                    has_until,
                    until_pc,
                    ctypes.byref(stop),
                )
            )
            return self._stop_dict(stop)

        if command == "step":
            stop = _Stop()
            self._check(self._library.sb_step(self._handle, ctypes.byref(stop)))
            return self._stop_dict(stop)

        if command in {"key", "press"}:
            button = request.get("button")
            if button not in KEYS:
                raise HarnessError("unknown button")
            if command == "key":
                pressed = request.get("pressed")
                if not isinstance(pressed, bool):
                    raise HarnessError("pressed must be a boolean")
                self._check(self._library.sb_set_key(self._handle, KEYS[button], pressed))
                return {"ok": True}
            self._check(self._library.sb_set_key(self._handle, KEYS[button], True))
            try:
                return self._dispatch(
                    {
                        "cmd": "run",
                        "frames": request.get("frames", 1),
                        "max_instructions": request.get("max_instructions", 50_000_000),
                    }
                )
            finally:
                self._check(self._library.sb_set_key(self._handle, KEYS[button], False))

        if command in {"read", "write"}:
            address = _integer(request.get("address"), "address", 0, 0xFFFF)
            if command == "read":
                length = _integer(
                    request.get("length", 1),
                    "length",
                    1,
                    MAX_MEMORY_TRANSFER,
                )
                if address + length > 0x10000:
                    raise HarnessError("memory read exceeds address space")
                buffer = (ctypes.c_uint8 * length)()
                self._check(
                    self._library.sb_read_memory(self._handle, address, buffer, length)
                )
                return {
                    "ok": True,
                    "address": address,
                    "length": length,
                    "hex": bytes(buffer).hex(),
                }
            hex_data = request.get("hex")
            if not isinstance(hex_data, str):
                raise HarnessError("write requires a hex string")
            try:
                data = bytes.fromhex(hex_data)
            except ValueError as error:
                raise HarnessError("write contains invalid hexadecimal data") from error
            if not 1 <= len(data) <= MAX_MEMORY_TRANSFER or address + len(data) > 0x10000:
                raise HarnessError("memory write must contain 1..4096 in-range bytes")
            buffer = (ctypes.c_uint8 * len(data)).from_buffer_copy(data)
            self._check(
                self._library.sb_write_memory(self._handle, address, buffer, len(data))
            )
            return {"ok": True, "written": len(data)}

        if command == "set-register":
            name = request.get("name")
            if name not in REGISTERS:
                raise HarnessError("unknown register")
            maximum = 0xFF if len(name) == 1 else 0xFFFF
            value = _integer(request.get("value"), "value", 0, maximum)
            self._check(
                self._library.sb_set_register(self._handle, REGISTERS[name], value)
            )
            return {"ok": True, "registers": self._native_registers()}

        if command == "breakpoint":
            action = request.get("action", "add")
            if action == "clear":
                self._library.sb_clear_breakpoints(self._handle)
                return {"ok": True}
            if action == "list":
                values = []
                for index in range(self._library.sb_breakpoint_count(self._handle)):
                    value = ctypes.c_uint16()
                    self._check(
                        self._library.sb_get_breakpoint(
                            self._handle, index, ctypes.byref(value)
                        )
                    )
                    values.append(value.value)
                return {"ok": True, "breakpoints": values}
            address = _integer(request.get("address"), "address", 0, 0xFFFF)
            operation = {
                "add": self._library.sb_add_breakpoint,
                "delete": self._library.sb_remove_breakpoint,
            }.get(action)
            if operation is None:
                raise HarnessError("breakpoint action must be add, delete, list, or clear")
            self._check(operation(self._handle, address))
            return {"ok": True, "address": address}

        if command == "watchpoint":
            action = request.get("action", "add")
            if action == "clear":
                self._library.sb_clear_watchpoints(self._handle)
                return {"ok": True}
            if action == "list":
                values = []
                reverse_access = {value: key for key, value in WATCH_ACCESS.items()}
                for index in range(self._library.sb_watchpoint_count(self._handle)):
                    value = _Watchpoint()
                    self._check(
                        self._library.sb_get_watchpoint(
                            self._handle, index, ctypes.byref(value)
                        )
                    )
                    values.append(
                        {
                            "start": value.start,
                            "end": value.end,
                            "access": reverse_access[value.access],
                        }
                    )
                return {"ok": True, "watchpoints": values}
            start = _integer(
                request.get("address", request.get("start")),
                "address",
                0,
                0xFFFF,
            )
            end = _integer(request.get("end", start), "end", start, 0xFFFF)
            if action == "delete":
                self._check(
                    self._library.sb_remove_watchpoint(self._handle, start, end)
                )
                return {"ok": True}
            access = request.get("access", "write")
            if action != "add" or access not in WATCH_ACCESS:
                raise HarnessError("watchpoint requires add/delete/list/clear and valid access")
            self._check(
                self._library.sb_add_watchpoint(
                    self._handle, start, end, WATCH_ACCESS[access]
                )
            )
            return {"ok": True, "start": start, "end": end}

        if command == "eval":
            expression = request.get("expression")
            if not isinstance(expression, str):
                raise HarnessError("eval requires expression")
            value = ctypes.c_uint16()
            bank = ctypes.c_uint16()
            self._check(
                self._library.sb_evaluate(
                    self._handle,
                    expression.encode(),
                    ctypes.byref(value),
                    ctypes.byref(bank),
                )
            )
            return {"ok": True, "value": value.value, "bank": bank.value}

        if command == "debug":
            debugger_command = request.get("command")
            if not isinstance(debugger_command, str):
                raise HarnessError("debug requires command")
            output = ctypes.create_string_buffer(65536)
            self._check(
                self._library.sb_debug(
                    self._handle,
                    debugger_command.encode(),
                    output,
                    len(output),
                )
            )
            return {"ok": True, "output": output.value.decode(errors="replace")}

        if command == "screenshot":
            path_value = request.get("path")
            if not isinstance(path_value, str):
                raise HarnessError("screenshot requires path")
            scale = _integer(request.get("scale", DEFAULT_SCREENSHOT_SCALE), "scale", 1, 8)
            frame = (ctypes.c_uint8 * FRAME_RGB_SIZE)()
            self._check(
                self._library.sb_copy_frame_rgb(
                    self._handle, frame, FRAME_RGB_SIZE
                )
            )
            path = Path(path_value).resolve()
            _write_png(path, bytes(frame), scale)
            return {
                "ok": True,
                "path": str(path),
                "width": SCREEN_WIDTH * scale,
                "height": SCREEN_HEIGHT * scale,
            }

        if command in {"save-state", "load-state", "load-symbols"}:
            path_value = request.get("path")
            if not isinstance(path_value, str):
                raise HarnessError(f"{command} requires path")
            path = str(Path(path_value).resolve()).encode()
            operation = {
                "save-state": self._library.sb_save_state,
                "load-state": self._library.sb_load_state,
                "load-symbols": self._library.sb_load_symbols,
            }[command]
            self._check(operation(self._handle, path))
            return {"ok": True}

        if command == "call-trace":
            action = request.get("action", "dump")
            if action in {"on", "off"}:
                self._check(self._library.sb_set_call_trace(self._handle, action == "on"))
                return {"ok": True}
            if action == "clear":
                self._check(self._library.sb_clear_call_trace(self._handle))
                return {"ok": True}
            if action == "dump":
                count = self._library.sb_get_call_targets(self._handle, None, 0)
                buf = (ctypes.c_uint32 * count)()
                n = self._library.sb_get_call_targets(self._handle, buf, count)
                targets = [
                    {"bank": key >> 16, "offset": key & 0xFFFF,
                     "canonical": f"ROM{key >> 16}:{key & 0xFFFF:04x}"}
                    for key in buf[:n]
                ]
                targets.sort(key=lambda t: (t["bank"], t["offset"]))
                return {"ok": True, "count": len(targets), "targets": targets}
            raise HarnessError("call-trace action must be on, off, clear, or dump")

        if command == "asset-trace":
            action = request.get("action", "dump")
            if action in {"on", "off"}:
                self._check(self._library.sb_set_asset_trace(self._handle, action == "on"))
                return {"ok": True}
            if action == "clear":
                self._check(self._library.sb_clear_asset_trace(self._handle))
                return {"ok": True}
            if action == "dump":
                count = self._library.sb_get_asset_runs(self._handle, None, 0)
                buf = (ctypes.c_uint16 * (count * 4))()
                n = self._library.sb_get_asset_runs(self._handle, buf, count)
                runs = [
                    {"bank": buf[i * 4], "src": buf[i * 4 + 1],
                     "dst": buf[i * 4 + 2], "length": buf[i * 4 + 3],
                     "canonical": f"ROM{buf[i * 4]}:{buf[i * 4 + 1]:04x}"}
                    for i in range(n)
                ]
                runs.sort(key=lambda r: (r["bank"], r["src"]))
                return {"ok": True, "count": len(runs), "runs": runs}
            raise HarnessError("asset-trace action must be on, off, clear, or dump")

        if command == "reset":
            quick = request.get("quick", False)
            if not isinstance(quick, bool):
                raise HarnessError("quick must be a boolean")
            self._check(self._library.sb_reset(self._handle, quick))
            return {"ok": True}

        if command == "reload":
            self._check(self._library.sb_reload(self._handle))
            return {"ok": True}

        if command == "quit":
            self._destroy()
            return {"ok": True}

        raise HarnessError("unknown command")

    def request(self, command: dict[str, Any]) -> dict[str, Any]:
        if not self._handle:
            raise HarnessError("SameBoy instance is closed")
        if self._trace is not None:
            self._trace.write(json.dumps(command, separators=(",", ":")) + "\n")
        return self._dispatch(command)

    def status(self) -> dict[str, Any]:
        return self.request({"cmd": "status"})

    def run(
        self,
        frames: int = 1,
        *,
        until_pc: int | None = None,
        max_instructions: int = 50_000_000,
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "cmd": "run",
            "frames": frames,
            "max_instructions": max_instructions,
        }
        if until_pc is not None:
            request["until_pc"] = until_pc
        return self.request(request)

    def step(self) -> dict[str, Any]:
        return self.request({"cmd": "step"})

    def key(self, button: str, pressed: bool) -> None:
        self.request({"cmd": "key", "button": button, "pressed": pressed})

    def press(self, button: str, frames: int = 1) -> dict[str, Any]:
        return self.request({"cmd": "press", "button": button, "frames": frames})

    def read(self, address: int, length: int = 1) -> bytes:
        return bytes.fromhex(
            self.request({"cmd": "read", "address": address, "length": length})["hex"]
        )

    def write(self, address: int, data: bytes) -> None:
        self.request({"cmd": "write", "address": address, "hex": data.hex()})

    def registers(self) -> dict[str, int]:
        return self.request({"cmd": "registers"})["registers"]

    def set_register(self, name: str, value: int) -> dict[str, int]:
        return self.request({"cmd": "set-register", "name": name, "value": value})[
            "registers"
        ]

    def add_breakpoint(self, address: int) -> None:
        self.request({"cmd": "breakpoint", "action": "add", "address": address})

    def delete_breakpoint(self, address: int) -> None:
        self.request({"cmd": "breakpoint", "action": "delete", "address": address})

    def clear_breakpoints(self) -> None:
        self.request({"cmd": "breakpoint", "action": "clear"})

    def add_watchpoint(
        self,
        address: int,
        *,
        end: int | None = None,
        access: str = "write",
    ) -> None:
        request: dict[str, Any] = {
            "cmd": "watchpoint",
            "action": "add",
            "address": address,
            "access": access,
        }
        if end is not None:
            request["end"] = end
        self.request(request)

    def clear_watchpoints(self) -> None:
        self.request({"cmd": "watchpoint", "action": "clear"})

    def evaluate(self, expression: str) -> int:
        return self.request({"cmd": "eval", "expression": expression})["value"]

    def debug(self, command: str) -> str:
        return self.request({"cmd": "debug", "command": command})["output"]

    def screenshot(self, path: str | Path, *, scale: int = DEFAULT_SCREENSHOT_SCALE) -> Path:
        destination = Path(path).resolve()
        self.request({"cmd": "screenshot", "path": str(destination), "scale": scale})
        return destination

    def save_state(self, path: str | Path) -> None:
        self.request({"cmd": "save-state", "path": str(Path(path).resolve())})

    def load_state(self, path: str | Path) -> None:
        self.request({"cmd": "load-state", "path": str(Path(path).resolve())})

    def load_symbols(self, path: str | Path) -> None:
        self.request({"cmd": "load-symbols", "path": str(Path(path).resolve())})

    def call_trace(self, on: bool = True) -> None:
        """Record runtime-resolved function entry points in switchable ROM
        banks — seeds for static analysis of bank-switched code."""
        self.request({"cmd": "call-trace", "action": "on" if on else "off"})

    def clear_call_trace(self) -> None:
        self.request({"cmd": "call-trace", "action": "clear"})

    def call_targets(self) -> list[dict[str, Any]]:
        """The recorded (bank, offset) seeds, e.g. {"canonical": "ROM5:4c00"}."""
        return self.request({"cmd": "call-trace", "action": "dump"})["targets"]

    def asset_trace(self, on: bool = True) -> None:
        """Record (bank, src, dst, len) runs of ROM data copied into VRAM —
        provenance for recovering and embedding original graphics."""
        self.request({"cmd": "asset-trace", "action": "on" if on else "off"})

    def clear_asset_trace(self) -> None:
        self.request({"cmd": "asset-trace", "action": "clear"})

    def asset_runs(self) -> list[dict[str, Any]]:
        """Recorded VRAM-copy runs. A run whose length covers its dest region
        is an uncompressed copy (extract statically from `canonical`); a short
        source feeding a long dest span indicates decompression (dump VRAM)."""
        return self.request({"cmd": "asset-trace", "action": "dump"})["runs"]

    def reset(self, *, quick: bool = False) -> None:
        self.request({"cmd": "reset", "quick": quick})

    def reload(self) -> None:
        self.request({"cmd": "reload"})

    def replay(self, requests: Iterator[dict[str, Any]]) -> list[dict[str, Any]]:
        return [self.request(request) for request in requests]

    def _destroy(self) -> None:
        if self._handle:
            self._library.sb_destroy(self._handle)
            self._handle = ctypes.c_void_p()

    def close(self) -> None:
        if self._handle and self._trace is not None:
            self._trace.write('{"cmd":"quit"}\n')
        self._destroy()
        if self._trace is not None:
            self._trace.close()
            self._trace = None

    def __enter__(self) -> SameBoy:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Control SameBoy with newline-delimited JSON")
    parser.add_argument("rom", type=Path)
    parser.add_argument("--trace", type=Path)
    parser.add_argument(
        "--command",
        help='Run one JSON command, for example: \'{"cmd":"run","frames":60}\'',
    )
    args = parser.parse_args()

    with SameBoy(args.rom, trace=args.trace) as sameboy:
        if args.command:
            print(json.dumps(sameboy.request(json.loads(args.command)), indent=2))
            return 0

        print("Enter one JSON request per line; Ctrl-D exits.", file=sys.stderr)
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                print(json.dumps(sameboy.request(json.loads(line)), indent=2))
            except (json.JSONDecodeError, HarnessError, ValueError) as error:
                print(json.dumps({"ok": False, "error": str(error)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
