#!/usr/bin/env python3
"""Frame-level differential test against the recovered Breakout ROM."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


PIPELINE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PIPELINE_ROOT / "agent"))

from sameboy import SameBoy  # noqa: E402


ORIGINAL_ROM = PIPELINE_ROOT / "raw_rom" / "breakout.gb"
RECONSTRUCTED_ROM = Path(__file__).resolve().parent / "breakout-reconstructed.gb"

ACTIVE_TILES = (0x8F, 0x8C, 0x8D, 0x8E)
EXPECTED_FIRST_ACTIVE_FRAME = 90


def visible_state(gameboy: SameBoy) -> bytes:
    """Return every byte that can affect this game's rendered frame."""

    return b"".join(
        (
            gameboy.read(0xFE00, 16),  # four active OAM entries
            gameboy.read(0x8800, 0x120),  # tile IDs $80-$91
            gameboy.read(0x9800, 0x240),  # 18 map rows with VRAM stride
            gameboy.read(0xFF40, 12),  # LCDC through WX, including palettes
        )
    )


def wait_for_first_active_frame(gameboy: SameBoy) -> int:
    for frame in range(1, 241):
        gameboy.run(frames=1)
        oam = gameboy.read(0xFE00, 16)
        if tuple(oam[index] for index in (2, 6, 10, 14)) == ACTIVE_TILES:
            return frame
    raise AssertionError("gameplay did not become active within 240 frames")


def assert_same(
    original: SameBoy,
    reconstructed: SameBoy,
    *,
    context: str,
) -> bytes:
    original_state = visible_state(original)
    reconstructed_state = visible_state(reconstructed)

    if original_state != reconstructed_state:
        offset = next(
            index
            for index, values in enumerate(zip(original_state, reconstructed_state))
            if values[0] != values[1]
        )
        raise AssertionError(
            f"{context}: visible state diverged at packed offset {offset:#x}: "
            f"original={original_state[offset]:#04x}, "
            f"reconstructed={reconstructed_state[offset]:#04x}"
        )

    return original_state


def align_pair(original: SameBoy, reconstructed: SameBoy) -> None:
    original_frame = wait_for_first_active_frame(original)
    reconstructed_frame = wait_for_first_active_frame(reconstructed)

    assert original_frame == EXPECTED_FIRST_ACTIVE_FRAME, original_frame
    assert reconstructed_frame == EXPECTED_FIRST_ACTIVE_FRAME, reconstructed_frame
    assert_same(original, reconstructed, context="first active frame")


def set_direction(
    gameboy: SameBoy,
    previous: str | None,
    current: str | None,
) -> None:
    if previous == current:
        return
    if previous is not None:
        gameboy.key(previous, False)
    if current is not None:
        gameboy.key(current, True)


def verify_loss_path() -> int:
    with SameBoy(ORIGINAL_ROM) as original, SameBoy(RECONSTRUCTED_ROM) as reconstructed:
        align_pair(original, reconstructed)

        previous_state = visible_state(original)
        unchanged_frames = 0

        for frame in range(1, 601):
            original.run(frames=1)
            reconstructed.run(frames=1)
            state = assert_same(
                original,
                reconstructed,
                context=f"uncontrolled frame {frame}",
            )

            if state == previous_state:
                unchanged_frames += 1
                if unchanged_frames == 8:
                    return frame
            else:
                unchanged_frames = 0
                previous_state = state

    raise AssertionError("uncontrolled game did not reach the shared idle state")


def verify_autoplay(frames: int) -> int:
    with SameBoy(ORIGINAL_ROM) as original, SameBoy(RECONSTRUCTED_ROM) as reconstructed:
        align_pair(original, reconstructed)

        direction: str | None = None

        for frame in range(1, frames + 1):
            oam = original.read(0xFE00, 16)
            ball_x = oam[1]
            paddle_x = oam[5]

            if ball_x < paddle_x + 8:
                next_direction = "left"
            elif ball_x > paddle_x + 16:
                next_direction = "right"
            else:
                next_direction = None

            set_direction(original, direction, next_direction)
            set_direction(reconstructed, direction, next_direction)
            direction = next_direction

            original.run(frames=1)
            reconstructed.run(frames=1)
            assert_same(
                original,
                reconstructed,
                context=f"autoplay frame {frame}",
            )

        tilemap = original.read(0x9800, 0x240)
        return 39 - tilemap.count(0x88)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--frames",
        type=int,
        default=2000,
        help="number of identical autoplay gameplay frames to require",
    )
    args = parser.parse_args()

    if not RECONSTRUCTED_ROM.exists():
        raise SystemExit("build breakout-reconstructed.gb before running this test")

    loss_frame = verify_loss_path()
    bricks_removed = verify_autoplay(args.frames)

    print(
        f"identical visible state: aligned at frame {EXPECTED_FIRST_ACTIVE_FRAME}, "
        f"loss idle reached at gameplay frame {loss_frame}, "
        f"{args.frames} autoplay frames matched, "
        f"{bricks_removed}/39 bricks removed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
