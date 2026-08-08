# Breakout ROM reverse-engineering report

ROM: `raw_rom/breakout.gb`  
SHA-256: `a120cce1d209f21b1d1e8e5daacb1fec9054405b25f3899bd511fd01642e6cbf`

## Executive summary

This is a complete but minimal Breakout game built for the original monochrome
Game Boy. It is almost certainly compiled from C with an SDCC/GBDK-style
runtime.

The game has:

- A 24-pixel paddle controlled by D-pad Left and Right.
- One ball moving one pixel on each axis per frame.
- 39 two-tile bricks in six staggered rows.
- Solid top and side walls, with an open bottom.
- One life, no score, no text, no sound, and no restart flow.
- A win when all 39 bricks are removed.
- A loss when the ball's OAM Y coordinate reaches `$9A`.
- The same silent idle state after either win or loss.

Static disassembly and live SameBoy traces agree on the state variables,
rendering path, input mapping, collision logic, and both terminal conditions.

## Cartridge and ROM layout

The cartridge is a valid 32 KiB DMG ROM-only image:

- Type: `$00` (ROM only; no memory-bank controller).
- External RAM: none.
- CGB/SGB features: none.
- Title: empty in the cartridge header.
- Revision: 1.
- Nintendo logo: valid.
- Header checksum: stored `$E6`, computed `$E6`.
- Global checksum: stored `$EB82`, computed `$EB82`.

Only the first 3,126 bytes contain meaningful code or data:

| ROM range | Purpose |
| --- | --- |
| `$0000-$007E` | Restart area, interrupt vectors, callback dispatcher |
| `$0100-$014F` | Entry point and cartridge header |
| `$0150-$01D4` | Startup and post-game idle loop |
| `$0200-$031F` | 18 two-bit-per-pixel tiles |
| `$0320-$06E5` | Game-specific code |
| `$06E6-$084D` | 20×18 background tile map |
| `$084E-$0C1B` | GBDK-like runtime helpers |
| `$0C1C-$0C35` | Game-global initialization |
| `$0C36-$7FFF` | `$FF` padding |

## Startup and control flow

The cartridge entry is:

```text
$0100  NOP
$0101  JP $0150
```

Startup at `$0150`:

1. Disables interrupts and sets `SP=$E000`.
2. Clears WRAM, OAM, HRAM, and interrupt state.
3. Safely disables the LCD.
4. Initializes scroll, palettes, serial state, and LCD registers.
5. Copies an OAM-DMA helper from ROM `$0904` to HRAM `$FF80`.
6. Registers VBlank callback `$08C5` and serial callback `$090E`.
7. Enables VBlank and serial interrupts with `IE=$09`.
8. Initializes game globals at `$0C1C`.
9. Calls the game initializer at `$05CD` through a banked-call runtime thunk.
10. Enters the permanent `$01D2` HALT loop after the game returns.

Bytes at `$01CE` look like `CALL $0105` to a linear disassembler, but they are
not executable instructions. `$09D8` treats them as an inline descriptor:

```text
target = $05CD
bank   = $01
return = $01D2
```

The write to the bank register at `$2000` is harmless boilerplate because this
cartridge has no bank controller.

## Runtime memory model

### Gameplay globals

| Address | Meaning | Initial value |
| --- | --- | --- |
| `$C0A0` | Paddle OAM X coordinate | `$4C` after paddle initialization |
| `$C0A1` | Ball OAM X coordinate | `$32` (50) |
| `$C0A2` | Ball OAM Y coordinate | `$78` (120) |
| `$C0A3` | Signed ball X velocity | `$01` (+1) |
| `$C0A4` | Signed ball Y velocity | `$FF` (-1) |
| `$C0A5` | Bricks remaining | `$27` (39) |

There are no gameplay variables for lives, score, level, serve state, or
restart state.

### Runtime globals

| Address | Meaning |
| --- | --- |
| `$C000-$C09F` | 160-byte shadow OAM copied to hardware OAM each VBlank |
| `$C0AB` | VBlank-completion flag |
| `$C0AD-$C0AE` | 16-bit VBlank/frame counter |
| `$C0AF-$C0BE` | VBlank callback list |
| `$C0BF-$C0CE` | LCD callback list |
| `$C0CF-$C0DE` | Timer callback list |
| `$C0DF-$C0EE` | Serial callback list |
| `$C0EF-$C0FE` | Joypad callback list |

## Main game algorithm

The game initializer at `$05CD` uploads tiles and the background map, assigns
sprite tiles, draws the initial objects, enables sprites, and enters the loop
at `$065D`.

Equivalent high-level logic:

```ts
let paddleX = 0x4c;
let ballX = 0x32;
let ballY = 0x78;
let ballVX = 1;
let ballVY = -1;
let bricksLeft = 39;

while (bricksLeft !== 0) {
  const keys = readJoypad();

  if (keys.left) {
    movePaddle(-2);
  } else if (keys.right) {
    movePaddle(2);
  }

  if (ballY + 6 >= 160) {
    return; // loss
  }

  if (collides(ballVX, 0)) {
    ballVX = -ballVX;
  }

  if (collides(0, ballVY)) {
    ballVY = -ballVY;
  }

  ballX += ballVX;
  ballY += ballVY;
  moveBallSprite(ballX, ballY);
  waitForVBlank();
}

return; // win
```

One loop iteration is synchronized to one VBlank, so physics runs at about
59.7 updates per second.

## Input and paddle

The joypad reader at `$0A26` performs the standard Game Boy two-phase scan.
The returned bits are:

| Bit | Button |
| --- | --- |
| 0 | Right |
| 1 | Left |
| 2 | Up |
| 3 | Down |
| 4 | A |
| 5 | B |
| 6 | Select |
| 7 | Start |

Only Left and Right are used. Left has priority if both are held.

`move_paddle` at `$0320`:

```ts
function movePaddle(delta: number) {
  if (delta === 0) paddleX = 0x4c;
  else paddleX += delta;

  paddleX = clamp(paddleX, 0x08, 0x90);

  moveSprite(1, paddleX,      0x98);
  moveSprite(2, paddleX + 8,  0x98);
  moveSprite(3, paddleX + 16, 0x98);
}
```

Game Boy sprites use an X offset of 8 and Y offset of 16. The visible paddle:

- Is fixed at screen Y 136.
- Is 24 pixels wide.
- Can occupy screen X 0 through 159.
- Moves two pixels per frame.

## Ball and collision model

Ball position uses OAM coordinates, not screen coordinates. Its visible
position is `(ballX - 8, ballY - 16)`.

Collision is axis-separated:

1. Probe `(ballVX, 0)` and reverse X velocity on collision.
2. Probe `(0, ballVY)` and reverse Y velocity on collision.
3. Apply the possibly modified velocities.

The collision routine at `$03C8` computes:

```ts
candidateX = ballX + dx;
candidateY = ballY + dy;

sampleX = candidateX + (ballVX > 0 ? 5 : 0);
sampleY = candidateY + (ballVY > 0 ? 5 : 0);

tileX = signedDivideBy8(sampleX - 8);
tileY = signedDivideBy8(sampleY - 16);
```

The six-pixel probe span approximates the visible ball graphic.

### Paddle collision

When `candidateY + 5 >= $98`, the routine checks whether either horizontal
edge of the ball overlaps the paddle interval. A hit is reported as solid.

The source-level predicate cannot be reconstructed uniquely, but the assembly
has a slight one-coordinate asymmetry at the paddle's right edge.

### Background collision

The background tile at `(tileX, tileY)` is read from `$9800`.

- `$80` is the only non-solid tile.
- Border tiles `$81-$87` are solid.
- Brick halves `$88` and `$89` are solid and destructible.

For a hit on `$88`, the sampled cell and the cell to its right are cleared.
For a hit on `$89`, the sampled cell and the cell to its left are cleared.
Both cells become `$80`, then `$C0A5` is decremented.

### Loss

`$05B1` reports loss when:

```ts
ballY + 6 >= 160
```

The first losing Y value is therefore `$9A` (154). This check runs before
paddle and tile collision for that frame.

## Graphics and map

ROM `$0200-$031F` contains 18 tiles loaded as tile IDs `$80-$91`:

| Tile IDs | Use |
| --- | --- |
| `$80` | Empty background |
| `$81-$87` | Top/side wall pieces and lower caps |
| `$88-$89` | Left and right halves of one brick |
| `$8C-$8E` | Paddle left, middle, and right |
| `$8F` | Ball |
| `$8A-$8B`, `$90-$91` | Blank/unused |

The background is a fixed 20×18 tile map:

```text
####################
#                  #
#                  #
#  = = = = = = =  #
#   = = = = = =   #
#  = = = = = = =  #
#   = = = = = =   #
#  = = = = = = =  #
#   = = = = = =   #
#                  #
#                  #
#                  #
#                  #
#                  #
#                  #
#                  #
|                  |
                    
```

Here `#` denotes a wall tile, `=` denotes a two-tile brick, and the bottom is
open. Brick rows alternate between seven and six bricks:

```text
7 + 6 + 7 + 6 + 7 + 6 = 39
```

This exactly matches the initial brick counter.

## Sprite and rendering pipeline

Only four sprites are active:

| OAM entry | Shadow address | Object | Tile | Initial OAM position |
| --- | --- | --- | --- | --- |
| 0 | `$C000-$C003` | Ball | `$8F` | Y `$78`, X `$32` |
| 1 | `$C004-$C007` | Paddle left | `$8C` | Y `$98`, X `$4C` |
| 2 | `$C008-$C00B` | Paddle middle | `$8D` | Y `$98`, X `$54` |
| 3 | `$C00C-$C00F` | Paddle right | `$8E` | Y `$98`, X `$5C` |

The VBlank callback at `$08C5` calls the HRAM routine at `$FF80`, which writes
`$C0` to DMA register `$FF46`. Hardware then copies `$C000-$C09F` to
`$FE00-$FE9F`.

Final LCD configuration is `$C3`:

- LCD enabled.
- Background enabled using map `$9800`.
- Signed tile-data addressing (`$8800-$97FF`).
- 8×8 sprites enabled.
- Window disabled.

Audio is explicitly disabled with `NR52=$00`, and no other audio registers are
used.

## Interrupt architecture

Vectors select null-terminated callback lists and enter the shared dispatcher
at `$0067`:

| Vector | Interrupt | Callback-list address |
| --- | --- | --- |
| `$0040` | VBlank | `$C0AF` |
| `$0048` | LCD STAT | `$C0BF` |
| `$0050` | Timer | `$C0CF` |
| `$0058` | Serial | `$C0DF` |
| `$0060` | Joypad | `$C0EF` |

Only VBlank and serial are enabled.

The VBlank callback:

1. Increments the 16-bit frame counter.
2. Runs shadow-OAM DMA.
3. Sets `$C0AB=1` to release the frame wait.

The serial handler is runtime handshake residue and does not affect gameplay.
Timer and joypad interrupts are unused; joypad input is polled.

## Live-debugger verification

The following facts were confirmed in SameBoy rather than inferred only from
static disassembly.

### Clean game-loop entry

Breakpoint `$065D` after reset showed:

```text
$C0A0-$C0A5 = 4C 32 78 01 FF 27
```

This confirms the paddle, ball, velocity, and 39-brick initialization.

Shadow OAM was:

```text
C000: 78 32 8F 00
C004: 98 4C 8C 00
C008: 98 54 8D 00
C00C: 98 5C 8E 00
```

### First brick collision

A write watchpoint on `$C0A5` stopped at `$03C5`:

```text
[$C0A5] = $26
ball X/Y = $52/$58
velocity = +1/-1
backtrace = $03C5 <- $0597 <- $06A7 <- $01CB
```

This proves that the vertical collision probe removed the first brick and
decremented the counter from 39 to 38.

Breakpoint `$06B6`, immediately after vertical reflection, showed:

```text
ball X/Y = $52/$58
velocity = +1/+1
```

This confirms the Y velocity negation.

### Loss

Conditional breakpoint `$0685 if e != 0` stopped with:

```text
ball X/Y = $94/$9A
velocity = +1/+1
bricks remaining = $26
backtrace = $0685 <- $01CB
```

This confirms the exact `$9A` loss threshold and direct return from the main
game function.

### Win

At a clean `$065D` loop entry, setting `$C0A5=0` caused execution to return
immediately and hit `$01D2`.

This confirms that the win path and loss path both end in the same HALT loop.

## Behavioral quirks and likely bugs

These behaviors follow from the recovered code:

1. There is no visible win or loss feedback; the game simply freezes.
2. There is no restart input, lives system, serve state, or score.
3. Left wins if Left and Right are pressed together.
4. Paddle overlap is checked during both axis probes, so some paddle contacts
   can reverse both X and Y rather than only Y.
5. Brick removal during the X probe changes what the Y probe sees in the same
   frame, making corner behavior order-dependent.
6. The Y probe chooses its horizontal sample edge using the possibly
   already-reversed global X velocity.
7. Loss is checked before collision, so the ball cannot be rescued once its
   OAM Y reaches `$9A`.
8. The paddle test does not explicitly require downward movement.
9. All non-empty background tiles are solid; there is no separate collision
   metadata.

## Minimal browser-port contract

A behaviorally faithful TypeScript port needs only:

- Six mutable gameplay values: paddle X, ball X/Y, ball VX/VY, bricks left.
- A 20×18 tile grid.
- Four rendered sprites or equivalent canvas shapes.
- Left/Right polling.
- A fixed 59.7 Hz update step.
- Axis-separated collision with a six-pixel ball probe.
- Two-tile brick clearing and a remaining-brick counter.
- A terminal idle state for either zero bricks or `ballY >= $9A`.

Everything else in the ROM is hardware/runtime support rather than game logic.
