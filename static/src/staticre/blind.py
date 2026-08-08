"""Harness-level blinding: neutralize a Game Boy ROM before the agent sees it.

The agent must never see the original filename or header title. We copy the
ROM to a content-addressed neutral name, zero the header title field, and fix
the header/global checksums so the ROM stays valid.
"""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

TITLE_START = 0x134
TITLE_END = 0x144  # exclusive; includes manufacturer/CGB byte region
HEADER_CHECKSUM = 0x14D
GLOBAL_CHECKSUM = 0x14E


def prepare_binary(src: str | Path, workdir: str | Path) -> dict:
    """Copy ROM into workdir under a neutral name, strip title, fix checksums.

    Returns {"path", "program_id", "sha256_original", "sha256_blinded", "size"}.
    """
    src = Path(src)
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)

    data = bytearray(src.read_bytes())
    sha_orig = hashlib.sha256(data).hexdigest()

    if len(data) >= 0x150:
        for i in range(TITLE_START, TITLE_END):
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
