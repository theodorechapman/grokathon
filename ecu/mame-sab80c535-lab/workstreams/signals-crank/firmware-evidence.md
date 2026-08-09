# Firmware timing contract

## Binary-proven configuration

The authoritative disassembly in `ecu/e2e-analysis/program-model.json` shows:

- `CODE:5CAA` writes `IEN0=A0`: global interrupts and Timer-2 overflow are
  enabled.
- `CODE:5CAD` writes `IEN1=00`: extended interrupt sources begin disabled.
- `CODE:5CC4/5CC7` write `IP0=3A` and `IP1=26`. The external-3 pair therefore
  has priority level 2 (`IP1.2:IP0.2 = 1:0`).
- `CODE:5CD0` writes `TCON=05`.
- `CODE:5CD3` writes `T2CON=85`: Timer 2 uses the timer input, divide-by-24
  oscillator prescaling, compare mode 1, and `I3FR=0`.
- `CODE:5CD9` writes `CCEN=01`: CRC/CC0 is in external capture mode; CC1,
  CC2, and CC3 begin disabled.
- `CODE:5CB0` writes `P1=FF`, satisfying the manufacturer's requirement that
  the P1.0 input latch be one for the alternate capture input to operate.

With `I3FR=0`, the manufacturer-defined CC0 capture edge is falling. This is
not a guessed waveform polarity: it follows from the binary value `T2CON=85`
and the SAB80C515 register definition.

## Capture and interrupt path

The firmware consumes one external timing capture channel:

- Pin function: P1.0 / INT3 / CC0.
- Capture destination: `CRCL` at SFR `CA` and `CRCH` at `CB`.
- Request flag: `IRCON.IEX3`, bit 2.
- Enable: `IEN1.EX3`, bit 2. Firmware uses bit address `BA` to mask and
  restore this source in timing-critical code.
- Vector: `CODE:0053`, which dispatches to `CODE:20A0`.
- Workers: acquisition at `2462`, synchronized scheduling at `21D8`,
  selected by `BITS:0021`.

Both workers read `CRCL`, `CRCH`, live `TH2`, and the software overflow epoch
at internal RAM `003F`. The Timer-2 vector is `CODE:002B -> 2070`; it increments
`003F`, clears `IRCON.TF2`, and returns. The high-byte consistency check in
`2462` and `21D8` corrects a capture that straddles Timer-2 overflow.

Manufacturer behavior needed by the patch is:

1. sample the external pin once per machine cycle;
2. recognize the configured transition from consecutive samples;
3. latch Timer 2 into CRC in the following machine cycle;
4. set `IEX3`, then clear it automatically when vector `0053` is accepted.

The patch deliberately makes the CRC value visible before the interrupt can
execute. It does not write firmware RAM or synthesize synchronization state.

## Other compare/capture channels

No direct `CCL1/CCH1` access was recovered, so CC1 has no proven firmware role.

CC2 (`C4/C5`, P1.2) and CC3 (`C6/C7`, P1.3) are used as scheduled outputs.
The firmware briefly selects software-capture mode (`CCEN` pair value 3),
writes the low byte to snapshot Timer 2, computes a deadline, then selects
compare mode (`CCEN` pair value 2). Their manufacturer request paths are
IEX5/vector `0063` and IEX6/vector `006B`; both firmware wrappers return
immediately. Exact output-pin shadow-latch waveforms remain unimplemented.

## Proven behavior versus vehicle assumptions

Proven by the binary:

- external-3/CC0 timestamp acquisition;
- falling-edge selection in the initialized configuration;
- extended 24-bit timestamp handling;
- interval-ratio synchronization and loss-of-sync recovery;
- CC2/CC3 deadline scheduling;
- period publication at internal RAM `003D-003E`.

Corroborated but not binary-proven:

- that the physical ECU trace reaching P1.0 is the crank sensor rather than
  another conditioned timing input;
- connector pin routing and electrical polarity before the MCU pin.

Unresolved and therefore configurable:

- positions per revolution;
- missing positions and reference-gap geometry;
- events per engine revolution;
- installed oscillator frequency and engineering-unit RPM scale.

Nothing in this workstream claims a 60-2 wheel. The bundled 12-position,
one-gap fixture is explicitly synthetic and exists only to test configurable
gap handling.

At the current MAME driver's assumed 12 MHz clock, one machine cycle is 1 us
and `T2CON.T2PS=1` increments Timer 2 every two machine cycles. Those rates are
emulator configuration, not proof of the production DME crystal.
