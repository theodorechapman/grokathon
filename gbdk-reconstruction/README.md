# GBDK C reconstruction

This is a behaviorally faithful C reconstruction of `../raw_rom/breakout.gb`
for GBDK 2020. It preserves the original graphics, map, controls, object
coordinates, collision order, 39-brick counter, and silent terminal state.

It is not expected to produce a byte-identical ROM. Compiler/runtime code and
symbol addresses will differ from the binary-only original.

## Build

Install [GBDK 2020](https://github.com/gbdk-2020/gbdk-2020/releases), then run:

```sh
make GBDK_HOME=/path/to/gbdk
```

Or provide the compiler directly:

```sh
make LCC=/path/to/gbdk/bin/lcc
```

The output is `breakout-reconstructed.gb`.

## Run in a browser

The `web` directory uses the TypeScript
[`gameboy-emulator`](https://github.com/roblouie/gameboy-emulator) package.
Build or copy the current ROM into the player and start its Vite development
server:

```sh
make serve-web
```

Then open the URL printed by Vite. Use the left and right arrow keys to move
the paddle.

## Differential verification

The deterministic SameBoy harness in the repository can compare the original
and reconstructed ROMs frame by frame:

```sh
make verify GBDK_HOME=/path/to/gbdk
```

The test aligns both ROMs at the first active gameplay frame, verifies the
uncontrolled loss path, then drives both with the same paddle inputs. Every
frame compares active OAM, tile graphics, the background map, LCD control,
scroll, window, and palette registers.

Increase the run length with `VERIFY_FRAMES`:

```sh
make verify GBDK_HOME=/path/to/gbdk VERIFY_FRAMES=6000
```

## Controls

- D-pad Left: move paddle left
- D-pad Right: move paddle right

The game intentionally has no score, lives, restart input, audio, or end
screen. Clearing all bricks or losing the ball freezes the final frame, just
as the recovered ROM does.

The generated machine code, internal WRAM addresses, stack layout, and exact
instruction-cycle timing still differ because modern GBDK supplies a different
compiler and runtime. Those differences do not affect the compared gameplay
or rendered state.

See `../breakout-reverse-engineering.md` for the address-level evidence behind
the reconstruction.
