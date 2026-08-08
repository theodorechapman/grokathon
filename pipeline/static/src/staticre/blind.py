"""Harness-level blinding: neutralize a Game Boy ROM before the agent sees it.

The agent must never see the original filename or header title. We copy the
ROM to a content-addressed neutral name, zero only the header bytes that are
actually title data, and fix the header/global checksums so the ROM stays
valid. Cartridge metadata (including the CGB flag and manufacturer code) is
left intact.
"""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

TITLE_START = 0x134
MANUFACTURER_START = 0x13F
CGB_FLAG = 0x143
LEGACY_TITLE_END = 0x144
HEADER_CHECKSUM = 0x14D
GLOBAL_CHECKSUM = 0x14E


def prepare_binary(src: str | Path, workdir: str | Path) -> dict:
    """Copy ROM into workdir under a neutral name, strip title, fix checksums.

    CGB headers have an 11-byte title followed by a four-byte manufacturer
    code and the CGB flag. Legacy DMG headers use the whole 16-byte region as
    their title. Preserve every non-title header byte in either layout.

    Returns {"path", "program_id", "sha256_original", "sha256", "size"}.
    """
    src = Path(src)
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)

    data = bytearray(src.read_bytes())
    sha_orig = hashlib.sha256(data).hexdigest()

    if len(data) >= 0x150:
        title_end = (
            MANUFACTURER_START if data[CGB_FLAG] & 0x80 else LEGACY_TITLE_END
        )
        for i in range(TITLE_START, title_end):
            data[i] = 0
        # Header checksum covers 0x134..0x14C
        chk = 0
        for i in range(0x134, 0x14D):
            chk = (chk - data[i] - 1) & 0xFF
        data[HEADER_CHECKSUM] = chk
        # Global checksum: sum of all bytes except the two checksum bytes
        data[GLOBAL_CHECKSUM] = 0
        data[GLOBAL_CHECKSUM + 1] = 0
        total = sum(data) & 0xFFFF
        data[GLOBAL_CHECKSUM] = (total >> 8) & 0xFF
        data[GLOBAL_CHECKSUM + 1] = total & 0xFF

    sha_blind = hashlib.sha256(data).hexdigest()
    program_id = f"program-{sha_blind[:12]}"
    dest = workdir / f"{program_id}.gb"
    if not dest.exists():
        dest.write_bytes(bytes(data))

    return {
        "path": str(dest),
        "program_id": program_id,
        "sha256_original": sha_orig,
        "sha256": sha_blind,
        "size": len(data),
    }
