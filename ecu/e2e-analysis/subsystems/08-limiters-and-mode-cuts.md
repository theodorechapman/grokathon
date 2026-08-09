# Rev limiting, overrun, WOT switching, and limp modes

## Rev-limit records

The canonical image contains two structurally matching records:

- primary base `42d0`, limit byte `42d5 = 0x90`, buffer
  `42d6 = 0x03`;
- secondary base `430e`, limit byte `4313 = 0x90`, buffer
  `4314 = 0x03`.

Their first 18 bytes are identical. The XDF equations report
`912500 / 0x90 = 6336.8 RPM` and `3 * 40 = 120 RPM`.
Those equations and the staged-injector-cut description are XDF claims, not
yet recovered firmware mathematics.

`CODE:27cc` directly consumes the primary record: `2909–291f` reads record
fields through offset `0x11` (`42d5`), and `2ad9–2ade` selects offset `0x12`
(`42d6`) into `INTMEM:0052`. `CODE:3530` independently copies
`42d0–42d2` into XRAM `0207–0209`. No direct access to the secondary
`4313/4314` pair is recovered.

## Mode switching

Fuel and ignition have distinct WOT, part-throttle, and idle payload
families. Runtime selector setup chooses overlapping pointer windows and
selector tables from mode bits. This is firmware proof of mode-dependent
calibration selection; exact TPS/load thresholds are not named.

## Cuts and transitions

The expected high-level transitions are:

- normal part-load to WOT calibration selection;
- normal fueling to overrun/fuel-cut state;
- normal control to one or more over-speed cut states;
- sensor/synchronization fault to fallback or recovery.

`CODE:27cc` owns `BITS:0038` (`rev_cut_stage_active`), complementary
`BITS:003a`, and the transition countdown at `INTMEM:0052`.
`CODE:3723` maintains a separate speed/load/temperature-qualified
`BITS:003b` deceleration/overrun latch with timer `INTMEM:00a0`.

The full chain from these latches to a physical injector or ignition output
has not been uniquely proven. The over-rev scenario fixture therefore reports the raw
records and lookup saturation only; it does not simulate injector shutdown.

## Outputs and failure behavior

Possible outputs are reduced fuel events, suppressed ignition events, changed
selector tables, and reinitialization at `5c00`. A physical ECU is required
to establish cut sequencing, hysteresis under real acceleration, and safety
behavior.

## Confidence

- High: duplicate records and raw values.
- High: primary record is consumed by a staged cut state machine.
- Medium: mode tables select WOT/part load and `BITS:003b` is overrun logic.
- Low: exact RPM conversion and staged injector-cut narrative.
- Unknown: overrun thresholds, output channels, and limp-mode transition map.
