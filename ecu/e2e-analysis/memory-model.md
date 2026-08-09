# Motronic 1.7 memory and runtime model

## Confidence notation

- **Proven**: encoded directly by instructions or bytes in the canonical image.
- **Corroborated**: multiple independent firmware observations agree.
- **Inferred**: a hardware or engineering role is consistent with the code but
  still depends on documentation, wiring, or runtime validation.
- **Unknown**: the binary exposes a location or operation but not its physical
  meaning.

## Program memory

| CPU range | Source | Status |
| --- | --- | --- |
| `CODE:0000–1fff` | Community UART-derived internal image | Strongly corroborated; not factory-authenticated |
| `CODE:2000–7fff` | EPROM physical `0x2000–7fff` | Byte-for-byte verified |
| `CODE:8000–9fff` | EPROM physical `0x0000–1fff` | Byte-for-byte verified A15 mapping |

The canonical image is SHA-256
`e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33`.
The three blocks are imported directly at their CPU addresses; no speculative
copy or alias is used.

## Calibration lookup state

`CODE:0400` proves that four internal bytes form two code-memory pointers:

- `INTMEM:0073–0074`: base of a two-byte calibration pointer window.
- `INTMEM:0075–0076`: base of a logical selector table.

`R2` is a logical selector index, not a direct index into the 150 pointer
slots. At `CODE:040e–042d`, the service:

1. reads `selector = CODE[selector_base + R2]`;
2. increments `R2` as a call side effect;
3. returns `0xff` and sets bit `BITS:004b` when `selector == 0xff`;
4. clears selector bit 0 and uses the remaining even value as a byte offset
   into the active pointer window;
5. uses selector bit 0 to choose the one-axis or two-axis interpolation path.

The setup routines at `CODE:7930–7c0c` select overlapping windows within the
master directory `CODE:45c0–46eb` and selector tables in `CODE:4000–41ff`.
`lookup-configuration.json` preserves every observed configuration and all
conflicting dimension flags instead of forcing one global mapping.

The descriptor first byte is an 8051 direct-data address (IDATA below `0x80`,
SFR at or above `0x80`). For example,
`CODE:046a–0473` reads the first descriptor byte into `R0`, then reads
`@R0` as the live first-axis input. The next byte is the axis count and the
following bytes are cumulative axis deltas. In the two-axis path, a second
IDATA address/count/delta vector follows. `CODE:0493` interpolates adjacent
payload values; `CODE:04a2` performs the second interpolation.

## Internal RAM and bits

The generated runtime model contains every direct Ghidra reference to
`INTMEM` and `BITS`, with reader and writer functions. Recovered producer and
consumer chains now name engine-speed/period state (`003b–003e`), crank
synchronization state (`0048–004f`), ignition angle/dwell (`0050–0056`),
injector duration (`005b–005c`), IAC reloads (`0064–0067`), calibration
pointers (`0073–0076`), and selected mode/output bits. Remaining locations
retain explicit unknown names.

Register banks occupy `INTMEM:0000–001f`; bit-addressable RAM occupies
`INTMEM:0020–002f`; ordinary internal RAM continues through `00ff`.
SFR bit addresses share the bit-address namespace, so the owning SFR must be
checked before interpreting a bit.

## External data memory

`runtime-state.json` records direct `EXTMEM` references. The 8051 `MOVX @Ri`
form combines the low byte in `Ri` with the current `P2` page. Ghidra often
prints only the low-byte address (for example `DAT_EXTMEM_007a`), so those
references are page-relative unless a preceding `P2` write proves the high
byte. `MOVX @DPTR` references are full 16-bit addresses.

Consequently, an `EXTMEM:00xx` name is a software offset, not proof of one
physical RAM chip or signal. The per-function instruction stream remains the
authority for page reconstruction.

Full-address accesses prove that `INTMEM:0022` is committed to the external
discrete-output latch at `EXTMEM:a040`; `a041` is a separate phase/output
sequence latch. Record storage at `0300–03fe` and its metadata are also
directly addressed.

## SAB80C515 peripheral space

The project labels the manufacturer-defined SFRs used by this image:

- ports: `P0`, `P1`, `P2`, `P3`, `P4`, `P5`, `P6`;
- core/watchdog: `SP`, `PCON`, `WDTREL`, `PSW`, `ACC`, `B`;
- timers: `TCON`, `TMOD`, `TL0/TH0`, `TL1/TH1`, `T2CON`, `TL2/TH2`;
- compare/capture: `CCEN`, `CCL1/CCH1`, `CCL2/CCH2`, `CCL3/CCH3`,
  `CRCL/CRCH`;
- ADC: `ADCON0`, `ADDAT`, `DAPR`;
- serial: `SCON`, `SBUF`;
- interrupts: `IEN0`, `IEN1`, `IP0`, `IP1`, `IRCON`.

An SFR reference proves use of that microcontroller peripheral. Mapping a port
or compare channel to an injector, coil, relay, crank sensor, or IAC remains a
separate wiring/schematic inference and is identified as such in subsystem
documents.

## Generated evidence

- `program-model.json`: authoritative disassembly, direct references, calls,
  and decompilation for 329 functions.
- `runtime-state.json`: 568 directly referenced state/SFR/bit locations.
- `lookup-dataflow.json`: 76 lookup calls; 75 have a finite propagated `R2`
  set and one records its unresolved live-in dependency.
- `calibration-index.json`: all 150 pointer slots, descriptor variants,
  selector-dependent consumers, and 35 active XDF table classifications.
