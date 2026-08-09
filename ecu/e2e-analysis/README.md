# End-to-end Motronic behavioral reconstruction

This directory is the canonical binary-only reconstruction of Bosch DME
`0 261 200 175`, software `1267356378`, for the BMW M42 Motronic 1.7.
It replaces the external-ROM calibration report with a CPU-addressed program,
runtime, hardware, calibration, and validation model.

## Result boundary

The result is an engineering software specification, not recovered original
source. It preserves disassembly as authority and adds typed pseudocode,
runtime references, calibration semantics, hardware evidence, and confidence
for every interpretation.

It cannot prove analog front-end transfer functions, Bosch custom-ASIC
internals, PCB routing, oscillator tolerance, power-stage behavior, or vehicle
safety without physical hardware.

## Canonical image

`TotalCombinedROM.bin` is 40 KiB and maps directly to CPU
`CODE:0000–9fff`. SHA-256:
`e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33`.

The internal 8 KiB is a community UART dump: strongly corroborated, not
factory-authenticated. The external 32 KiB mapping is byte-for-byte verified:
EPROM `2000–7fff` stays at CPU `2000–7fff`; EPROM `0000–1fff` maps to CPU
`8000–9fff`.

## Principal corrections

- Internal code is present and analyzable; reset reaches `0073`, `20e0`, and
  initialization at `5c00`.
- The master pointer directory at `45c0` has 150 entries and terminates at
  `46ec`, not 132 entries.
- `R2` is not a direct master-pointer index. `CODE:0400` first reads
  `selector_table[R2]`; the selector chooses an overlapping pointer window,
  carries a dimension bit, and may terminate with `0xff`.
- A descriptor’s first byte is an 8051 direct-data address for its live axis
  input. `046a` locates intervals, `0493` interpolates adjacent values, and
  `04a2` performs the second-axis interpolation.
- `CODE:9016` computes the runtime ROM checksum as a zero-seeded modulo-65536
  byte sum over `0000–9eff` and compares it big-endian at `9f00–9f01`.

## Program model

Ghidra 12.1.2 imports the image as `8051:BE:16:default` and exports all
reachable instructions, references, calls, and decompilations.

- 329 functions are represented.
- Every function has a semantic name or explicit `unknown_<address>` role.
- Confidence: 44 high, 261 medium, 24 low.
- Low-confidence functions retain disassembly and reasons such as speculative
  high-ROM flow or a target outside `9fff`.
- All 13 reset/interrupt roots and their wrappers are classified.

## Runtime and calibration model

- 568 directly referenced IDATA, bit, SFR, and XRAM locations have reader and
  writer sets.
- All 76 external `CODE:0400` calls are represented; 75 have a concrete or
  finite logical-index set. `CODE:3640` records its unresolved custom-ABI
  live-in dependency.
- The master directory contains 150 slots and 145 unique targets.
- 127 targets match the conservative descriptor heuristic; selector-aware
  decoding preserves 207 one/two-axis variants, including conflicts.
- All 35 active XDF tables are classified: 30 have an exact descriptor payload
  match and five remain another format or unresolved.

Unobserved or configuration-dependent use is never labeled “unused.”

## Hardware model

The firmware uses Timer 0/1/2, compare/capture channels, UART, ADC, interrupt
controls, and ports. External-3/CC0 is the main capture dispatcher; serial
interrupts enter `8960`; the ADC vector is a direct `RETI`, while ADC
registers are polled elsewhere.

`601a–607d` is the cooperative foreground executive; Timer 1 refreshes the
watchdog and supervises a heartbeat; software-pended INT0 performs deferred
ADC/timing/state work. Diagnostics implement KW71-compatible framing, fault
records, actuator tests, memory services, identifiers, and programming.

Logical output roles are resolved in firmware: Timer 0/P1.5 commands ignition,
CC2/P1.2 and CC3/P1.3 schedule injector banks, Timer 1/P1.7 generates IAC
PWM, and `INTMEM:0022 -> EXTMEM:a040` commits discrete outputs. Physical
connector, bank/cylinder, and relay identities remain wiring-level questions.

Manufacturer-defined peripheral roles are separated from BMW connector and
community schematic inference in `hardware-model.md`.

## Validation

The Ghidra Sleigh emulator deterministically:

- reproduces reset entry through `5c00`;
- executes 100 calibration-lookup cases across 25 logical indices and four
  synthetic input values;
- reaches `CODE:0469` in every lookup case.

An independent Python decoder checks raw selector bytes, pointer targets,
descriptor structure, one/two-axis control flow, terminators, and result byte
bounds. All 100 traces pass. Scenario-named fixtures are explicitly
component-level evidence organization, not whole-vehicle simulation.

## Reproduce

Requirements are Homebrew Ghidra 12.1.2, OpenJDK 21, Bash, and Python 3.

```sh
bash ecu/e2e-analysis/run-analysis.sh
```

The script builds a temporary isolated Ghidra project and regenerates every
JSON and trace artifact. It does not modify the plan file or the source ROMs.

## Deliverables

- `manifest.json`: hashes, provenance, and CPU mapping.
- `program-model.json`: authoritative instruction/reference/decompile export.
- `function-catalog.json` and `symbols.json`: evidence-scored program ledger.
- `memory-model.md`, `hardware-model.md`, and `hardware-model.json`.
- `calibration-index.json`, `lookup-configuration.json`, and
  `lookup-dataflow.json`.
- `subsystems/`: eleven address-cited behavioral specifications.
- `traces/`: reset, lookup, validation, and constrained scenario fixtures.
- `integrity.json`: checksum and RAM-integrity evidence.
- `OPEN-QUESTIONS.md`: unresolved behavior and required evidence.

## Evidence sources

- Firmware and XDF artifacts in this repository.
- [Infineon SAB80C515 family user manual](https://www.keil.com/dd/docs/datashts/infineon/80x515_um.pdf).
- BMW M1.7/M42 training and wiring material, treated separately from firmware.
- Community M42 pinout/schematic material, never promoted above its provenance.
